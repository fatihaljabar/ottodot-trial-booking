// Fixture tes integrasi — SELALU UUID acak per run, TIDAK PERNAH menyentuh
// data demo (prisma/fixtures.ts). Cleanup di-scope lewat trial_class_id yang
// dibuat scenario ini sendiri, mengikuti pola yang sama dengan perbaikan
// reset-demo.ts: query ulang saat teardown, bukan menghardcode daftar ID.

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";

export type Scenario = {
  trialClassId: string;
  parentId: string;
};

export async function createScenario(
  db: PrismaClient,
  opts: { confirmedCount: number; startsInDays?: number; alreadyStarted?: boolean } = { confirmedCount: 0 },
): Promise<Scenario> {
  const trialClassId = randomUUID();
  const startsAt = opts.alreadyStarted
    ? new Date(Date.now() - 60_000)
    : new Date(Date.now() + (opts.startsInDays ?? 14) * 86_400_000);

  await db.trialClass.create({
    data: { id: trialClassId, title: "Kelas Tes", subject: "math", startsAt },
  });

  const parentId = randomUUID();
  await db.parent.create({ data: { id: parentId, displayName: "Parent Tes" } });

  for (let i = 0; i < opts.confirmedCount; i++) {
    const studentId = randomUUID();
    await db.student.create({ data: { id: studentId, parentId, displayName: `Seed Student ${i}` } });

    const bookingId = randomUUID();
    const operationId = randomUUID();
    const now = new Date();
    await db.booking.create({
      data: { id: bookingId, studentId, trialClassId, status: "confirmed", confirmedAt: now },
    });
    await db.paymentOperation.create({
      data: { operationId, parentId, bookingId, requestedOutcome: "success", resultCode: "confirmed" },
    });
    await db.paymentAttempt.create({
      data: { bookingId, operationId, result: "succeeded", amountIdr: 50_000, currency: "IDR" },
    });
  }

  return { trialClassId, parentId };
}

export async function createChild(db: PrismaClient, parentId: string, displayName: string): Promise<string> {
  const studentId = randomUUID();
  await db.student.create({ data: { id: studentId, parentId, displayName } });
  return studentId;
}

export async function cleanupScenario(db: PrismaClient, scenario: Scenario): Promise<void> {
  // Bersihkan lewat parentId scenario SECARA LANGSUNG — bukan menebak dari
  // booking yang ada. createScenario selalu membuat tepat satu parent;
  // seorang anak bisa saja GAGAL di-booking (mis. createBooking menolak
  // CLASS_STARTED sebelum insert apa pun terjadi), dan anak/parent semacam
  // itu tetap harus terhapus meski tidak pernah punya baris booking.
  const students = await db.student.findMany({
    where: { parentId: scenario.parentId },
    select: { id: true },
  });
  const studentIds = students.map((s) => s.id);

  const bookings = await db.booking.findMany({
    where: { studentId: { in: studentIds } },
    select: { id: true },
  });
  const bookingIds = bookings.map((b) => b.id);

  await db.paymentAttempt.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.paymentOperation.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await db.booking.deleteMany({ where: { id: { in: bookingIds } } });
  await db.trialClass.delete({ where: { id: scenario.trialClassId } });
  await db.student.deleteMany({ where: { id: { in: studentIds } } });
  await db.parent.delete({ where: { id: scenario.parentId } });
}
