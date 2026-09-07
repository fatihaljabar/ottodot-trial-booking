// Fungsi service murni: tidak mengimpor singleton "server-only" apa pun.
// Setiap fungsi menerima `db` (PrismaClient) sebagai parameter pertama —
// Route Handler mengoper singleton dari ./prisma; tes dan script mengoper
// PrismaClient miliknya sendiri dari @/lib/db-client. Ini yang membuat modul
// ini bisa diuji lewat Vitest tanpa menyentuh "server-only" (lihat db-client.ts).

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { DomainError } from "./errors";
import type {
  ParentSummary,
  StudentSummary,
  TrialClassView,
  BookingView,
  PaymentAttemptView,
  ClassRoster,
  RosterStudent,
  MockOutcome,
  OperationResult,
  FinalizeMockPaymentResult,
} from "@/lib/contracts";

const CAPACITY = 4;

// Fungsi read boleh dijalankan lewat client biasa atau di dalam transaksi
// (dipakai ulang oleh createBooking/finalizeMockPayment).
type Db = PrismaClient | Prisma.TransactionClient;

// --- Helper bentuk (TECHNICAL.md bagian 6) ---------------------------------

const trialClassInclude = {
  _count: { select: { bookings: { where: { status: "confirmed" } } } },
} satisfies Prisma.TrialClassInclude;

type TrialClassWithCount = Prisma.TrialClassGetPayload<{ include: typeof trialClassInclude }>;

function toTrialClassView(tc: TrialClassWithCount, now: Date): TrialClassView {
  const confirmedCount = tc._count.bookings;
  const availableSeats = CAPACITY - confirmedCount;
  return {
    id: tc.id,
    title: tc.title,
    subject: tc.subject,
    starts_at: tc.startsAt.toISOString(),
    timezone: "Asia/Jakarta",
    capacity: 4,
    price: tc.price,
    currency: "SGD",
    confirmed_count: confirmedCount,
    available_seats: availableSeats,
    is_bookable: tc.startsAt.getTime() > now.getTime() && availableSeats > 0,
  };
}

const bookingInclude = {
  student: true,
  trialClass: { include: trialClassInclude },
  paymentAttempts: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
} satisfies Prisma.BookingInclude;

type BookingWithRelations = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

function toPaymentAttemptView(a: BookingWithRelations["paymentAttempts"][number]): PaymentAttemptView {
  return {
    id: a.id,
    operation_id: a.operationId,
    result: a.result,
    reason: a.reason,
    amount: a.amount,
    currency: "SGD",
    created_at: a.createdAt.toISOString(),
  };
}

function toBookingView(b: BookingWithRelations, now: Date): BookingView {
  return {
    id: b.id,
    student: { id: b.student.id, display_name: b.student.displayName, parent_id: b.student.parentId },
    class: toTrialClassView(b.trialClass, now),
    status: b.status,
    created_at: b.createdAt.toISOString(),
    updated_at: b.updatedAt.toISOString(),
    confirmed_at: b.confirmedAt ? b.confirmedAt.toISOString() : null,
    payment_attempts: b.paymentAttempts.map(toPaymentAttemptView),
  };
}

// --- Read RPC (BL-006) ------------------------------------------------------

export async function listDemoParents(db: Db): Promise<ParentSummary[]> {
  const parents = await db.parent.findMany({ orderBy: { displayName: "asc" } });
  return parents.map((p) => ({ id: p.id, display_name: p.displayName }));
}

export async function listStudents(db: Db, parentId: string): Promise<StudentSummary[]> {
  const parent = await db.parent.findUnique({ where: { id: parentId } });
  if (!parent) {
    throw new DomainError("NOT_FOUND", "Parent profile not found.");
  }
  const students = await db.student.findMany({
    where: { parentId },
    orderBy: { displayName: "asc" },
  });
  return students.map((s) => ({ id: s.id, display_name: s.displayName, parent_id: s.parentId }));
}

export async function listTrialClasses(db: Db, includeStarted = false): Promise<TrialClassView[]> {
  const now = new Date();
  const classes = await db.trialClass.findMany({
    where: includeStarted ? undefined : { startsAt: { gt: now } },
    include: trialClassInclude,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
  return classes.map((c) => toTrialClassView(c, now));
}

export async function getBookingDetail(
  db: Db,
  parentId: string,
  bookingId: string,
): Promise<{ booking: BookingView }> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: bookingInclude,
  });
  if (!booking || booking.student.parentId !== parentId) {
    throw new DomainError("NOT_FOUND", "Booking not found.");
  }
  return { booking: toBookingView(booking, new Date()) };
}

export async function getClassRoster(db: Db, trialClassId: string): Promise<ClassRoster> {
  const now = new Date();
  const trialClass = await db.trialClass.findUnique({
    where: { id: trialClassId },
    include: trialClassInclude,
  });
  if (!trialClass) {
    throw new DomainError("NOT_FOUND", "Class not found.");
  }

  // Read-only, ditampilkan untuk demo guru: dua query terpisah (bukan satu
  // snapshot atomik) cukup di sini karena PRD §8.4 mengizinkan roster belum
  // menampilkan peserta terbaru sesaat sebelum refresh. Invariant kapasitas
  // yang sesungguhnya dijaga oleh finalizeMockPayment, bukan oleh read ini.
  const confirmedBookings = await db.booking.findMany({
    where: { trialClassId, status: "confirmed" },
    include: { student: true },
    orderBy: [{ confirmedAt: "asc" }, { id: "asc" }],
  });

  const students: RosterStudent[] = confirmedBookings.map((b) => ({
    student_id: b.studentId,
    display_name: b.student.displayName,
    booking_id: b.id,
    confirmed_at: b.confirmedAt!.toISOString(),
  }));

  return { class: toTrialClassView(trialClass, now), students };
}

// --- Create/reuse booking (BL-007, TECHNICAL §4.3) --------------------------

export async function createBooking(
  client: PrismaClient,
  parentId: string,
  studentId: string,
  trialClassId: string,
): Promise<{ booking: BookingView; created: boolean }> {
  return client.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;

      const student = await tx.student.findUnique({ where: { id: studentId } });
      if (!student || student.parentId !== parentId) {
        throw new DomainError("NOT_FOUND", "Child not found for this profile.");
      }

      // Kunci baris kelas SEBELUM apa pun lain — urutan lock TECHNICAL §4.1.
      const lockedClass = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "trial_classes" WHERE id = ${trialClassId}::uuid FOR UPDATE
      `;
      if (lockedClass.length === 0) {
        throw new DomainError("NOT_FOUND", "Class not found.");
      }

      const existing = await tx.booking.findUnique({
        where: { studentId_trialClassId: { studentId, trialClassId } },
        include: bookingInclude,
      });
      if (existing) {
        // Booking kanonis sudah ada — kembalikan apa adanya, termasuk bila
        // sudah confirmed pada kelas yang kini penuh. Tidak mengecek ulang
        // kapasitas/waktu untuk membatalkan booking lama (TECHNICAL §4.3 #4).
        return { booking: toBookingView(existing, new Date()), created: false };
      }

      const trialClass = await tx.trialClass.findUniqueOrThrow({ where: { id: trialClassId } });
      if (trialClass.startsAt.getTime() <= Date.now()) {
        throw new DomainError("CLASS_STARTED", "The class has already started.");
      }

      // COUNT sebagai statement terpisah SETELAH lock diperoleh (§4.1).
      const confirmedCount = await tx.booking.count({
        where: { trialClassId, status: "confirmed" },
      });
      if (confirmedCount >= CAPACITY) {
        throw new DomainError("CLASS_FULL", "The class is full.");
      }

      const created = await tx.booking.create({
        data: { studentId, trialClassId, status: "pending_payment" },
        include: bookingInclude,
      });

      return { booking: toBookingView(created, new Date()), created: true };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 10_000,
    },
  );
}

// --- Finalisasi mock payment (BL-008, TECHNICAL §4.4) -----------------------

function composeFinalizeResult(
  op: { operationId: string; requestedOutcome: MockOutcome; resultCode: OperationResult; createdAt: Date },
  attempt: BookingWithRelations["paymentAttempts"][number] | null,
  booking: BookingWithRelations,
  replayed: boolean,
): FinalizeMockPaymentResult {
  return {
    booking: toBookingView(booking, new Date()),
    operation: {
      operation_id: op.operationId,
      requested_outcome: op.requestedOutcome,
      result_code: op.resultCode,
      created_at: op.createdAt.toISOString(),
      replayed,
    },
    attempt: attempt ? toPaymentAttemptView(attempt) : null,
  };
}

export async function finalizeMockPayment(
  client: PrismaClient,
  parentId: string,
  bookingId: string,
  operationId: string,
  requestedOutcome: MockOutcome,
): Promise<FinalizeMockPaymentResult> {
  return client.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;

      // 1. Validasi parent dan kepemilikan booking; baca class_id tanpa write.
      const bookingBasic = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { student: true },
      });
      if (!bookingBasic || bookingBasic.student.parentId !== parentId) {
        throw new DomainError("NOT_FOUND", "Booking not found.");
      }
      const trialClassId = bookingBasic.trialClassId;

      // 2. Kunci kelas FOR UPDATE — urutan lock kelas -> booking -> operation ID.
      await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "trial_classes" WHERE id = ${trialClassId}::uuid FOR UPDATE
      `;

      // 3. Kunci dan baca ulang booking FOR NO KEY UPDATE; validasi kepemilikan lagi.
      await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "bookings" WHERE id = ${bookingId}::uuid FOR NO KEY UPDATE
      `;
      let booking = await tx.booking.findUniqueOrThrow({
        where: { id: bookingId },
        include: bookingInclude,
      });
      if (booking.student.parentId !== parentId) {
        throw new DomainError("NOT_FOUND", "Booking not found.");
      }

      // 4. Cari payment_operations berdasarkan operation_id global.
      const existingOp = await tx.paymentOperation.findUnique({ where: { operationId } });
      if (existingOp) {
        if (
          existingOp.parentId === parentId &&
          existingOp.bookingId === bookingId &&
          existingOp.requestedOutcome === requestedOutcome
        ) {
          const attempt = await tx.paymentAttempt.findUnique({ where: { operationId } });
          return composeFinalizeResult(existingOp, attempt, booking, true);
        }
        throw new DomainError("IDEMPOTENCY_CONFLICT", "This operation ID is already bound to a different request.");
      }

      // 5. Tentukan hasil TANPA menulis attempt/booking dulu.
      let resultCode: OperationResult;
      if (booking.status === "confirmed") {
        resultCode = "already_confirmed";
      } else if (booking.status === "seat_unavailable") {
        resultCode = "already_unavailable";
      } else {
        if (booking.trialClass.startsAt.getTime() <= Date.now()) {
          throw new DomainError("CLASS_STARTED", "The class has already started.");
        }
        // COUNT sebagai statement terpisah SETELAH lock diperoleh (§4.1).
        const confirmedCount = await tx.booking.count({
          where: { trialClassId, status: "confirmed" },
        });
        if (confirmedCount >= CAPACITY) {
          resultCode = "class_full";
        } else if (requestedOutcome === "failure") {
          resultCode = "payment_failed";
        } else {
          resultCode = "confirmed";
        }
      }

      // 6. Klaim operation_id global. ON CONFLICT DO NOTHING — BUKAN try/catch
      // atas P2002: pelanggaran constraint akan meracuni seluruh transaksi
      // Postgres tanpa savepoint (lihat TECHNICAL §4.4 dan CLAUDE.md invariant #7).
      const inserted = await tx.$queryRaw<{ operation_id: string }[]>`
        INSERT INTO "payment_operations"
          ("operation_id", "parent_id", "booking_id", "requested_outcome", "result_code")
        VALUES (${operationId}::uuid, ${parentId}::uuid, ${bookingId}::uuid,
                ${requestedOutcome}::"MockOutcome", ${resultCode}::"OperationResult")
        ON CONFLICT ("operation_id") DO NOTHING
        RETURNING "operation_id"
      `;

      if (inserted.length === 0) {
        // 7. Key diklaim transaksi lain (mungkin kelas berbeda) — SELECT ulang
        // dalam statement baru. Jangan membuat attempt atau memakai keputusan
        // kapasitas yang baru dihitung di atas.
        const raced = await tx.paymentOperation.findUnique({ where: { operationId } });
        if (!raced) {
          throw new DomainError("INTERNAL_ERROR", "Operation ID conflict could not be resolved.");
        }
        if (
          raced.parentId === parentId &&
          raced.bookingId === bookingId &&
          raced.requestedOutcome === requestedOutcome
        ) {
          const attempt = await tx.paymentAttempt.findUnique({ where: { operationId } });
          return composeFinalizeResult(raced, attempt, booking, true);
        }
        throw new DomainError("IDEMPOTENCY_CONFLICT", "This operation ID is already bound to a different request.");
      }

      // 8. Key berhasil diklaim oleh transaksi ini.
      if (resultCode === "already_confirmed" || resultCode === "already_unavailable") {
        // 9. Terminal no-op: receipt tersimpan, tanpa attempt, tanpa perubahan booking.
        const op = await tx.paymentOperation.findUniqueOrThrow({ where: { operationId } });
        return composeFinalizeResult(op, null, booking, false);
      }

      // 8a. Periksa waktu mulai SEKALI LAGI setelah lock benar-benar diperoleh —
      // melindungi kasus menunggu UNIQUE key lintas kelas lalu waktu kelas berubah.
      const freshClass = await tx.trialClass.findUniqueOrThrow({ where: { id: trialClassId } });
      if (freshClass.startsAt.getTime() <= Date.now()) {
        throw new DomainError("CLASS_STARTED", "The class has already started.");
      }

      const amount = freshClass.price;
      const currency = freshClass.currency;
      const finalizedAt = new Date();

      if (resultCode === "class_full") {
        await tx.paymentAttempt.create({
          data: { bookingId, operationId, result: "not_processed", reason: "class_full", amount, currency },
        });
        booking = await tx.booking.update({
          where: { id: bookingId },
          data: { status: "seat_unavailable", updatedAt: finalizedAt },
          include: bookingInclude,
        });
      } else if (resultCode === "payment_failed") {
        await tx.paymentAttempt.create({
          data: { bookingId, operationId, result: "failed", reason: "mock_declined", amount, currency },
        });
        booking = await tx.booking.update({
          where: { id: bookingId },
          data: { status: "payment_failed", updatedAt: finalizedAt },
          include: bookingInclude,
        });
      } else {
        await tx.paymentAttempt.create({
          data: { bookingId, operationId, result: "succeeded", reason: null, amount, currency },
        });
        booking = await tx.booking.update({
          where: { id: bookingId },
          data: { status: "confirmed", confirmedAt: finalizedAt, updatedAt: finalizedAt },
          include: bookingInclude,
        });
      }

      const op = await tx.paymentOperation.findUniqueOrThrow({ where: { operationId } });
      const attempt = await tx.paymentAttempt.findUnique({ where: { operationId } });
      return composeFinalizeResult(op, attempt, booking, false);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 10_000,
    },
  );
}
