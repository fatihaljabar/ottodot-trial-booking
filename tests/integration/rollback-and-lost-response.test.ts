import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createPrismaClient } from "@/lib/db-client";
import type { PrismaClient } from "@/generated/prisma/client";
import { createBooking, finalizeMockPayment, getBookingDetail } from "@/lib/server/booking-service";
import { createChild, createScenario, cleanupScenario, type Scenario } from "../helpers/scenario";

describe("snapshot kedaluwarsa, respons hilang, dan rollback (AT-13, AT-14, AT-15)", () => {
  let db: PrismaClient;
  let scenario: Scenario;

  beforeEach(async () => {
    db = createPrismaClient();
    scenario = await createScenario(db, { confirmedCount: 0 });
  });

  afterEach(async () => {
    await cleanupScenario(db, scenario);
    await db.$disconnect();
  });

  it("AT-13: snapshot UI menunjukkan kursi tersedia tapi kelas sudah penuh saat finalisasi", async () => {
    // Anak target membuat pending SAAT kelas masih terlihat tersedia (0 confirmed).
    const staleStudent = await createChild(db, scenario.parentId, "Anak Stale");
    const staleBooking = await createBooking(db, scenario.parentId, staleStudent, scenario.trialClassId);

    // Empat anak lain mengisi kelas sampai penuh SEBELUM anak target membayar —
    // meniru "UI belum di-refresh" dari PRD §8.3/AT-13.
    for (let i = 0; i < 4; i++) {
      const fillerStudent = await createChild(db, scenario.parentId, `Filler ${i}`);
      const fillerBooking = await createBooking(db, scenario.parentId, fillerStudent, scenario.trialClassId);
      await finalizeMockPayment(db, scenario.parentId, fillerBooking.booking.id, randomUUID(), "success");
    }

    // Anak target BARU SEKARANG membayar, terhadap snapshot yang sudah basi.
    const result = await finalizeMockPayment(db, scenario.parentId, staleBooking.booking.id, randomUUID(), "success");

    expect(result.operation.result_code).toBe("class_full");
    expect(result.attempt?.result).toBe("not_processed");
    expect(result.booking.status).toBe("seat_unavailable");

    const finalCount = await db.booking.count({ where: { trialClassId: scenario.trialClassId, status: "confirmed" } });
    expect(finalCount).toBe(4);
  });

  it("AT-14: respons sukses 'hilang' lalu operasi diulang — tidak ada charge kedua", async () => {
    const studentId = await createChild(db, scenario.parentId, "Anak AT-14");
    const booking = await createBooking(db, scenario.parentId, studentId, scenario.trialClassId);
    const opId = randomUUID();

    // Panggilan pertama BENAR-BENAR commit ke database — kita sengaja tidak
    // memakai return value-nya di sini, meniru respons yang "hilang" sebelum
    // sampai ke client (TECHNICAL §12.4 / AT-14).
    await finalizeMockPayment(db, scenario.parentId, booking.booking.id, opId, "success");

    const afterFirstCall = await getBookingDetail(db, scenario.parentId, booking.booking.id);
    expect(afterFirstCall.booking.status).toBe("confirmed");
    expect(afterFirstCall.booking.payment_attempts).toHaveLength(1);

    // Client, karena responsnya hilang, mengulang dengan operation_id SAMA.
    const replay = await finalizeMockPayment(db, scenario.parentId, booking.booking.id, opId, "success");
    expect(replay.operation.replayed).toBe(true);
    expect(replay.booking.status).toBe("confirmed");

    // Tidak ada charge/attempt kedua akibat replay.
    const afterReplay = await getBookingDetail(db, scenario.parentId, booking.booking.id);
    expect(afterReplay.booking.payment_attempts).toHaveLength(1);
    expect(afterReplay.booking.payment_attempts[0].id).toBe(afterFirstCall.booking.payment_attempts[0].id);
  });

  it("AT-15: exception di tengah transaksi — receipt, attempt, dan booking rollback bersama", async () => {
    const studentId = await createChild(db, scenario.parentId, "Anak AT-15");
    const booking = await createBooking(db, scenario.parentId, studentId, scenario.trialClassId);

    // Trigger uji, DIBATASI hanya pada booking.id target ini — bukan bagian
    // migration produksi. Melempar exception TEPAT ketika status akan diubah
    // menjadi 'confirmed', yaitu setelah payment_attempts sudah di-insert
    // (menguji rollback lintas tabel, bukan cuma satu statement).
    await db.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION pg_temp_at15_block() RETURNS trigger AS $$
      BEGIN
        IF NEW.status = 'confirmed' AND NEW.id = '${booking.booking.id}'::uuid THEN
          RAISE EXCEPTION 'AT15_INJECTED_FAILURE';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await db.$executeRawUnsafe(`
      CREATE TRIGGER at15_block_confirm BEFORE UPDATE ON bookings
      FOR EACH ROW EXECUTE FUNCTION pg_temp_at15_block();
    `);

    try {
      await expect(
        finalizeMockPayment(db, scenario.parentId, booking.booking.id, randomUUID(), "success"),
      ).rejects.toThrow(/AT15_INJECTED_FAILURE/);

      // Baca dari koneksi TERPISAH untuk memastikan yang terlihat adalah
      // keadaan committed sesungguhnya, bukan cache di client yang sama.
      const observer = createPrismaClient();
      try {
        const detail = await getBookingDetail(observer, scenario.parentId, booking.booking.id);
        expect(detail.booking.status).toBe("pending_payment");
        expect(detail.booking.confirmed_at).toBeNull();
        expect(detail.booking.payment_attempts).toHaveLength(0);

        const opCount = await observer.paymentOperation.count({ where: { bookingId: booking.booking.id } });
        expect(opCount).toBe(0);
      } finally {
        await observer.$disconnect();
      }
    } finally {
      // Bersihkan trigger uji — jangan sampai bocor ke test lain.
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS at15_block_confirm ON bookings;`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS pg_temp_at15_block();`);
    }
  });
});
