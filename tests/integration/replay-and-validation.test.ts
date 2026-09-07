import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createPrismaClient } from "@/lib/db-client";
import type { PrismaClient } from "@/generated/prisma/client";
import { createBooking, finalizeMockPayment, getClassRoster, getBookingDetail } from "@/lib/server/booking-service";
import { DomainError } from "@/lib/server/errors";
import { createChild, createScenario, cleanupScenario, type Scenario } from "../helpers/scenario";

describe("replay, idempotensi, dan validasi (AT-08..AT-12, AT-16..AT-18)", () => {
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

  it("AT-08: replay operation_id + input sama tidak menambah attempt/charge", async () => {
    const studentId = await createChild(db, scenario.parentId, "Anak AT-08");
    const booking = await createBooking(db, scenario.parentId, studentId, scenario.trialClassId);
    const opId = randomUUID();

    const first = await finalizeMockPayment(db, scenario.parentId, booking.booking.id, opId, "success");
    const replay = await finalizeMockPayment(db, scenario.parentId, booking.booking.id, opId, "success");

    expect(replay.operation.replayed).toBe(true);
    expect(replay.operation.result_code).toBe("confirmed");
    expect(replay.booking.status).toBe("confirmed");
    expect(replay.booking.payment_attempts).toHaveLength(1);
    expect(replay.attempt?.id).toBe(first.attempt?.id);

    const roster = await getClassRoster(db, scenario.trialClassId);
    expect(roster.students).toHaveLength(1);
  });

  it("AT-09: dua operation_id berbeda pada booking pending yang sama, bersamaan — tepat satu succeeded", async () => {
    const studentId = await createChild(db, scenario.parentId, "Anak AT-09");
    const booking = await createBooking(db, scenario.parentId, studentId, scenario.trialClassId);

    const [r1, r2] = await Promise.all([
      finalizeMockPayment(db, scenario.parentId, booking.booking.id, randomUUID(), "success"),
      finalizeMockPayment(db, scenario.parentId, booking.booking.id, randomUUID(), "success"),
    ]);

    const codes = [r1.operation.result_code, r2.operation.result_code].sort();
    expect(codes).toEqual(["already_confirmed", "confirmed"]);

    const winner = r1.operation.result_code === "confirmed" ? r1 : r2;
    const loser = r1.operation.result_code === "confirmed" ? r2 : r1;
    expect(winner.attempt?.result).toBe("succeeded");
    expect(loser.attempt).toBeNull();

    const detail = await getBookingDetail(db, scenario.parentId, booking.booking.id);
    expect(detail.booking.payment_attempts).toHaveLength(1);

    const roster = await getClassRoster(db, scenario.trialClassId);
    expect(roster.students).toHaveLength(1);
  });

  it("AT-10: gagal lalu key baru sukses — histori gagal tetap ada", async () => {
    const studentId = await createChild(db, scenario.parentId, "Anak AT-10");
    const booking = await createBooking(db, scenario.parentId, studentId, scenario.trialClassId);

    const failed = await finalizeMockPayment(db, scenario.parentId, booking.booking.id, randomUUID(), "failure");
    expect(failed.booking.status).toBe("payment_failed");

    const succeeded = await finalizeMockPayment(db, scenario.parentId, booking.booking.id, randomUUID(), "success");
    expect(succeeded.booking.status).toBe("confirmed");
    expect(succeeded.booking.payment_attempts).toHaveLength(2);
    expect(succeeded.booking.payment_attempts[0].result).toBe("failed");
    expect(succeeded.booking.payment_attempts[1].result).toBe("succeeded");
  });

  it("AT-11: replay attempt failed lama setelah booking confirmed — status tidak turun", async () => {
    const studentId = await createChild(db, scenario.parentId, "Anak AT-11");
    const booking = await createBooking(db, scenario.parentId, studentId, scenario.trialClassId);

    const failOp = randomUUID();
    await finalizeMockPayment(db, scenario.parentId, booking.booking.id, failOp, "failure");
    await finalizeMockPayment(db, scenario.parentId, booking.booking.id, randomUUID(), "success");

    // Replay operation yang GAGAL, dikirim ulang setelah booking sudah confirmed.
    const replayOldFailed = await finalizeMockPayment(db, scenario.parentId, booking.booking.id, failOp, "failure");

    expect(replayOldFailed.operation.replayed).toBe(true);
    expect(replayOldFailed.operation.result_code).toBe("payment_failed");
    // Booking view yang dikembalikan tetap status TERKINI (confirmed), bukan hasil historis.
    expect(replayOldFailed.booking.status).toBe("confirmed");
  });

  it("AT-12: read model dengan campuran status — hanya confirmed muncul di roster", async () => {
    const s1 = await createChild(db, scenario.parentId, "Confirmed");
    const s2 = await createChild(db, scenario.parentId, "Failed");
    const s3 = await createChild(db, scenario.parentId, "Pending");

    const b1 = await createBooking(db, scenario.parentId, s1, scenario.trialClassId);
    await finalizeMockPayment(db, scenario.parentId, b1.booking.id, randomUUID(), "success");

    const b2 = await createBooking(db, scenario.parentId, s2, scenario.trialClassId);
    await finalizeMockPayment(db, scenario.parentId, b2.booking.id, randomUUID(), "failure");

    await createBooking(db, scenario.parentId, s3, scenario.trialClassId);

    const roster = await getClassRoster(db, scenario.trialClassId);
    expect(roster.students).toHaveLength(1);
    expect(roster.students[0].display_name).toBe("Confirmed");
    expect(roster.class.confirmed_count).toBe(1);
  });

  it("AT-16a: input invalid (booking tidak ada) ditolak tanpa mutasi", async () => {
    await expect(
      finalizeMockPayment(db, scenario.parentId, randomUUID(), randomUUID(), "success"),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("AT-16b: profil salah (parent bukan pemilik booking) ditolak", async () => {
    const studentId = await createChild(db, scenario.parentId, "Anak AT-16b");
    const booking = await createBooking(db, scenario.parentId, studentId, scenario.trialClassId);

    const otherParentId = randomUUID();
    await db.parent.create({ data: { id: otherParentId, displayName: "Bukan Pemilik" } });

    await expect(
      finalizeMockPayment(db, otherParentId, booking.booking.id, randomUUID(), "success"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Booking tidak berubah sama sekali.
    const detail = await getBookingDetail(db, scenario.parentId, booking.booking.id);
    expect(detail.booking.status).toBe("pending_payment");
    expect(detail.booking.payment_attempts).toHaveLength(0);

    await db.parent.delete({ where: { id: otherParentId } });
  });

  it("AT-16c: operation_id sama, input berbeda (outcome berbeda) → IDEMPOTENCY_CONFLICT", async () => {
    const studentId = await createChild(db, scenario.parentId, "Anak AT-16c");
    const booking = await createBooking(db, scenario.parentId, studentId, scenario.trialClassId);
    const opId = randomUUID();

    await finalizeMockPayment(db, scenario.parentId, booking.booking.id, opId, "success");

    await expect(
      finalizeMockPayment(db, scenario.parentId, booking.booking.id, opId, "failure"),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    // Booking tetap confirmed, tidak ada attempt kedua yang tercipta dari request yang ditolak.
    const detail = await getBookingDetail(db, scenario.parentId, booking.booking.id);
    expect(detail.booking.status).toBe("confirmed");
    expect(detail.booking.payment_attempts).toHaveLength(1);
  });

  it("AT-17: status dibaca dari database lewat koneksi baru (simulasi restart)", async () => {
    const studentId = await createChild(db, scenario.parentId, "Anak AT-17");
    const booking = await createBooking(db, scenario.parentId, studentId, scenario.trialClassId);
    await finalizeMockPayment(db, scenario.parentId, booking.booking.id, randomUUID(), "success");

    // Koneksi/proses BARU, tidak berbagi state apa pun dengan client di atas.
    const freshDb = createPrismaClient();
    try {
      const detail = await getBookingDetail(freshDb, scenario.parentId, booking.booking.id);
      expect(detail.booking.status).toBe("confirmed");
      expect(detail.booking.payment_attempts).toHaveLength(1);
    } finally {
      await freshDb.$disconnect();
    }
  });

  it("AT-18a: create baru pada kelas yang sudah dimulai ditolak", async () => {
    const startedScenario = await createScenario(db, { confirmedCount: 0, alreadyStarted: true });
    const studentId = await createChild(db, startedScenario.parentId, "Anak AT-18a");

    await expect(
      createBooking(db, startedScenario.parentId, studentId, startedScenario.trialClassId),
    ).rejects.toMatchObject({ code: "CLASS_STARTED" });

    await cleanupScenario(db, startedScenario);
  });

  it("AT-18b: finalisasi pada kelas yang sudah dimulai ditolak tanpa pembayaran sukses", async () => {
    const studentId = await createChild(db, scenario.parentId, "Anak AT-18b");
    const booking = await createBooking(db, scenario.parentId, studentId, scenario.trialClassId);

    // Majukan waktu mulai kelas ke masa lalu SETELAH booking dibuat.
    await db.trialClass.update({
      where: { id: scenario.trialClassId },
      data: { startsAt: new Date(Date.now() - 60_000) },
    });

    await expect(
      finalizeMockPayment(db, scenario.parentId, booking.booking.id, randomUUID(), "success"),
    ).rejects.toMatchObject({ code: "CLASS_STARTED" });

    const detail = await getBookingDetail(db, scenario.parentId, booking.booking.id);
    expect(detail.booking.status).toBe("pending_payment");
    expect(detail.booking.payment_attempts).toHaveLength(0);
  });
});
