// Data fixture demo — TECHNICAL.md bagian 11. UUID tetap dipakai bersama oleh
// prisma/seed.ts (insert pertama kali) dan scripts/reset-demo.ts (hapus lalu
// bangun ulang). Fixture tes integrasi TIDAK memakai modul ini — tes memakai
// UUID acak per run (TECHNICAL §10.2).

import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export const FIXTURE_IDS = {
  PARENT_A: "a0000000-0000-4000-8000-000000000001",
  PARENT_B: "a0000000-0000-4000-8000-000000000002",
  PARENT_SEED: "a0000000-0000-4000-8000-000000000003",

  CHILD_A: "b0000000-0000-4000-8000-000000000001",
  CHILD_A2: "b0000000-0000-4000-8000-000000000002",
  CHILD_B: "b0000000-0000-4000-8000-000000000003",
  SEED_1: "b0000000-0000-4000-8000-000000000004",
  SEED_2: "b0000000-0000-4000-8000-000000000005",
  SEED_3: "b0000000-0000-4000-8000-000000000006",

  AVAILABLE: "c0000000-0000-4000-8000-000000000001",
  LAST_SEAT: "c0000000-0000-4000-8000-000000000002",

  BOOKING_CHILD_A2: "d0000000-0000-4000-8000-000000000001",
  BOOKING_SEED_1: "d0000000-0000-4000-8000-000000000002",
  BOOKING_SEED_2: "d0000000-0000-4000-8000-000000000003",
  BOOKING_SEED_3: "d0000000-0000-4000-8000-000000000004",

  OPERATION_CHILD_A2: "e0000000-0000-4000-8000-000000000001",
  OPERATION_SEED_1: "e0000000-0000-4000-8000-000000000002",
  OPERATION_SEED_2: "e0000000-0000-4000-8000-000000000003",
  OPERATION_SEED_3: "e0000000-0000-4000-8000-000000000004",
} as const;

// Asia/Jakarta (WIB) adalah UTC+7 sepanjang tahun, tanpa DST — 10:00 WIB
// sama dengan 03:00 UTC pada tanggal yang sama.
function wibAtDaysFromNow(days: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, 3, 0, 0, 0),
  );
}

type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * Insert seluruh fixture demo. Dipanggil pada database yang kosong dari data
 * fixture ini (seed pertama kali, atau setelah reset-demo menghapusnya).
 */
export async function insertFixtures(tx: Tx): Promise<void> {
  const ids = FIXTURE_IDS;

  await tx.parent.createMany({
    data: [
      { id: ids.PARENT_A, displayName: "Parent A" },
      { id: ids.PARENT_B, displayName: "Parent B" },
      { id: ids.PARENT_SEED, displayName: "Seed Parent" },
    ],
  });

  await tx.student.createMany({
    data: [
      { id: ids.CHILD_A, parentId: ids.PARENT_A, displayName: "Child A" },
      { id: ids.CHILD_A2, parentId: ids.PARENT_A, displayName: "Child A2" },
      { id: ids.CHILD_B, parentId: ids.PARENT_B, displayName: "Child B" },
      { id: ids.SEED_1, parentId: ids.PARENT_SEED, displayName: "Seed Child 1" },
      { id: ids.SEED_2, parentId: ids.PARENT_SEED, displayName: "Seed Child 2" },
      { id: ids.SEED_3, parentId: ids.PARENT_SEED, displayName: "Seed Child 3" },
    ],
  });

  await tx.trialClass.createMany({
    data: [
      {
        id: ids.AVAILABLE,
        title: "Math Trial",
        subject: "math",
        startsAt: wibAtDaysFromNow(14),
      },
      {
        id: ids.LAST_SEAT,
        title: "Science Trial",
        subject: "science",
        startsAt: wibAtDaysFromNow(15),
      },
    ],
  });

  const now = new Date();

  await tx.booking.createMany({
    data: [
      {
        id: ids.BOOKING_CHILD_A2,
        studentId: ids.CHILD_A2,
        trialClassId: ids.AVAILABLE,
        status: "payment_failed",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: ids.BOOKING_SEED_1,
        studentId: ids.SEED_1,
        trialClassId: ids.LAST_SEAT,
        status: "confirmed",
        createdAt: now,
        updatedAt: now,
        confirmedAt: now,
      },
      {
        id: ids.BOOKING_SEED_2,
        studentId: ids.SEED_2,
        trialClassId: ids.LAST_SEAT,
        status: "confirmed",
        createdAt: now,
        updatedAt: now,
        confirmedAt: now,
      },
      {
        id: ids.BOOKING_SEED_3,
        studentId: ids.SEED_3,
        trialClassId: ids.LAST_SEAT,
        status: "confirmed",
        createdAt: now,
        updatedAt: now,
        confirmedAt: now,
      },
    ],
  });

  await tx.paymentOperation.createMany({
    data: [
      {
        operationId: ids.OPERATION_CHILD_A2,
        parentId: ids.PARENT_A,
        bookingId: ids.BOOKING_CHILD_A2,
        requestedOutcome: "failure",
        resultCode: "payment_failed",
      },
      {
        operationId: ids.OPERATION_SEED_1,
        parentId: ids.PARENT_SEED,
        bookingId: ids.BOOKING_SEED_1,
        requestedOutcome: "success",
        resultCode: "confirmed",
      },
      {
        operationId: ids.OPERATION_SEED_2,
        parentId: ids.PARENT_SEED,
        bookingId: ids.BOOKING_SEED_2,
        requestedOutcome: "success",
        resultCode: "confirmed",
      },
      {
        operationId: ids.OPERATION_SEED_3,
        parentId: ids.PARENT_SEED,
        bookingId: ids.BOOKING_SEED_3,
        requestedOutcome: "success",
        resultCode: "confirmed",
      },
    ],
  });

  await tx.paymentAttempt.createMany({
    data: [
      {
        bookingId: ids.BOOKING_CHILD_A2,
        operationId: ids.OPERATION_CHILD_A2,
        result: "failed",
        reason: "mock_declined",
        amount: 50,
        currency: "SGD",
      },
      {
        bookingId: ids.BOOKING_SEED_1,
        operationId: ids.OPERATION_SEED_1,
        result: "succeeded",
        reason: null,
        amount: 50,
        currency: "SGD",
      },
      {
        bookingId: ids.BOOKING_SEED_2,
        operationId: ids.OPERATION_SEED_2,
        result: "succeeded",
        reason: null,
        amount: 50,
        currency: "SGD",
      },
      {
        bookingId: ids.BOOKING_SEED_3,
        operationId: ids.OPERATION_SEED_3,
        result: "succeeded",
        reason: null,
        amount: 50,
        currency: "SGD",
      },
    ],
  });
}

/**
 * Hapus seluruh fixture demo dalam urutan FK (attempt -> operation -> booking
 * -> class -> student -> parent). Dipakai reset-demo.ts sebelum insertFixtures.
 * TIDAK PERNAH menyentuh baris lain — hanya ID yang didefinisikan di atas.
 */
export async function deleteFixtures(tx: Tx): Promise<void> {
  const ids = FIXTURE_IDS;
  const classIds = [ids.AVAILABLE, ids.LAST_SEAT];
  const studentIds = [ids.CHILD_A, ids.CHILD_A2, ids.CHILD_B, ids.SEED_1, ids.SEED_2, ids.SEED_3];
  const parentIds = [ids.PARENT_A, ids.PARENT_B, ids.PARENT_SEED];

  // Hapus SEMUA booking yang menunjuk dua kelas fixture ini — bukan hanya
  // empat booking awal dari seed. Demo/manual testing bisa membuat booking
  // baru terhadap anak fixture (mis. CHILD_A mencoba AVAILABLE), dan reset
  // harus membersihkan itu juga; menghardcode ID booking awal membuat FK ke
  // trial_classes gagal begitu ada booking tambahan yang belum dihapus.
  const bookingsToDelete = await tx.booking.findMany({
    where: { trialClassId: { in: classIds } },
    select: { id: true },
  });
  const bookingIds = bookingsToDelete.map((b) => b.id);

  await tx.paymentAttempt.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await tx.paymentOperation.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
  await tx.trialClass.deleteMany({ where: { id: { in: classIds } } });
  await tx.student.deleteMany({ where: { id: { in: studentIds } } });
  await tx.parent.deleteMany({ where: { id: { in: parentIds } } });
}
