import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createPrismaClient } from "@/lib/db-client";
import type { PrismaClient } from "@/generated/prisma/client";
import { createBooking, finalizeMockPayment, getClassRoster } from "@/lib/server/booking-service";
import { createChild, createScenario, cleanupScenario, type Scenario } from "../helpers/scenario";

describe("booking lifecycle (AT-01..AT-05)", () => {
  let db: PrismaClient;
  let scenario: Scenario;

  beforeEach(async () => {
    db = createPrismaClient();
    scenario = await createScenario(db, { confirmedCount: 0 });
  });

  afterEach(async () => {
    await cleanupScenario(db, scenario.trialClassId);
    await db.$disconnect();
  });

  it("AT-01: submit valid menghasilkan satu pending tanpa operation/attempt; roster tetap 0", async () => {
    const studentId = await createChild(db, scenario.parentId, "Anak AT-01");

    const result = await createBooking(db, scenario.parentId, studentId, scenario.trialClassId);

    expect(result.created).toBe(true);
    expect(result.booking.status).toBe("pending_payment");
    expect(result.booking.payment_attempts).toHaveLength(0);

    const roster = await getClassRoster(db, scenario.trialClassId);
    expect(roster.students).toHaveLength(0);
    expect(roster.class.confirmed_count).toBe(0);
  });

  it("AT-02: mock sukses menghasilkan confirmed, satu attempt sukses, roster +1", async () => {
    const studentId = await createChild(db, scenario.parentId, "Anak AT-02");
    const booking = await createBooking(db, scenario.parentId, studentId, scenario.trialClassId);

    const result = await finalizeMockPayment(
      db,
      scenario.parentId,
      booking.booking.id,
      randomUUID(),
      "success",
    );

    expect(result.operation.result_code).toBe("confirmed");
    expect(result.attempt?.result).toBe("succeeded");
    expect(result.booking.status).toBe("confirmed");
    expect(result.booking.confirmed_at).not.toBeNull();

    const roster = await getClassRoster(db, scenario.trialClassId);
    expect(roster.students).toHaveLength(1);
    expect(roster.class.confirmed_count).toBe(1);
  });

  it("AT-03: mock gagal saat kursi tersedia menghasilkan payment_failed; roster tidak berubah", async () => {
    const studentId = await createChild(db, scenario.parentId, "Anak AT-03");
    const booking = await createBooking(db, scenario.parentId, studentId, scenario.trialClassId);

    const result = await finalizeMockPayment(
      db,
      scenario.parentId,
      booking.booking.id,
      randomUUID(),
      "failure",
    );

    expect(result.operation.result_code).toBe("payment_failed");
    expect(result.attempt?.result).toBe("failed");
    expect(result.attempt?.reason).toBe("mock_declined");
    expect(result.booking.status).toBe("payment_failed");

    const roster = await getClassRoster(db, scenario.trialClassId);
    expect(roster.students).toHaveLength(0);
    expect(roster.class.available_seats).toBe(4);
  });

  it("AT-04: submit ulang pada booking confirmed mengembalikan referensi sama tanpa charge baru", async () => {
    const studentId = await createChild(db, scenario.parentId, "Anak AT-04");
    const first = await createBooking(db, scenario.parentId, studentId, scenario.trialClassId);
    await finalizeMockPayment(db, scenario.parentId, first.booking.id, randomUUID(), "success");

    const second = await createBooking(db, scenario.parentId, studentId, scenario.trialClassId);

    expect(second.created).toBe(false);
    expect(second.booking.id).toBe(first.booking.id);
    expect(second.booking.status).toBe("confirmed");
    expect(second.booking.payment_attempts).toHaveLength(1);
  });

  it("AT-05: dua create paralel anak-kelas sama menghasilkan satu booking kanonis", async () => {
    const studentId = await createChild(db, scenario.parentId, "Anak AT-05");

    const [r1, r2] = await Promise.all([
      createBooking(db, scenario.parentId, studentId, scenario.trialClassId),
      createBooking(db, scenario.parentId, studentId, scenario.trialClassId),
    ]);

    expect(r1.booking.id).toBe(r2.booking.id);
    // Tepat satu dari keduanya yang membuat baris baru; yang lain reuse.
    expect([r1.created, r2.created].filter(Boolean)).toHaveLength(1);

    const count = await db.booking.count({
      where: { studentId, trialClassId: scenario.trialClassId },
    });
    expect(count).toBe(1);
  });
});
