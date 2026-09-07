-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending_payment', 'confirmed', 'payment_failed', 'seat_unavailable');

-- CreateEnum
CREATE TYPE "Subject" AS ENUM ('science', 'math');

-- CreateEnum
CREATE TYPE "MockOutcome" AS ENUM ('success', 'failure');

-- CreateEnum
CREATE TYPE "AttemptResult" AS ENUM ('succeeded', 'failed', 'not_processed');

-- CreateEnum
CREATE TYPE "AttemptReason" AS ENUM ('mock_declined', 'class_full');

-- CreateEnum
CREATE TYPE "OperationResult" AS ENUM ('confirmed', 'payment_failed', 'class_full', 'already_confirmed', 'already_unavailable');

-- CreateTable
CREATE TABLE "parents" (
    "id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_classes" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "subject" "Subject" NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "price_idr" INTEGER NOT NULL DEFAULT 50000,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "trial_class_id" UUID NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending_payment',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_operations" (
    "operation_id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "requested_outcome" "MockOutcome" NOT NULL,
    "result_code" "OperationResult" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "payment_operations_pkey" PRIMARY KEY ("operation_id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "result" "AttemptResult" NOT NULL,
    "reason" "AttemptReason",
    "amount_idr" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "students_parent_id_idx" ON "students"("parent_id");

-- CreateIndex
CREATE INDEX "trial_classes_starts_at_id_idx" ON "trial_classes"("starts_at", "id");

-- CreateIndex
CREATE INDEX "bookings_trial_class_id_idx" ON "bookings"("trial_class_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_student_id_trial_class_id_key" ON "bookings"("student_id", "trial_class_id");

-- CreateIndex
CREATE INDEX "payment_operations_booking_id_idx" ON "payment_operations"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_operations_operation_id_booking_id_key" ON "payment_operations"("operation_id", "booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_operation_id_key" ON "payment_attempts"("operation_id");

-- CreateIndex
CREATE INDEX "payment_attempts_booking_id_created_at_id_idx" ON "payment_attempts"("booking_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_operation_id_booking_id_key" ON "payment_attempts"("operation_id", "booking_id");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_trial_class_id_fkey" FOREIGN KEY ("trial_class_id") REFERENCES "trial_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_operation_id_booking_id_fkey" FOREIGN KEY ("operation_id", "booking_id") REFERENCES "payment_operations"("operation_id", "booking_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Constraint tambahan yang tidak bisa diekspresikan Prisma schema.
-- Lihat TECHNICAL.md bagian 2.7.

-- 1. Satu pembayaran sukses per booking (BR-08)
CREATE UNIQUE INDEX "payment_attempts_one_success"
  ON "payment_attempts" ("booking_id") WHERE "result" = 'succeeded';

-- 2. confirmed_at konsisten dengan status
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_confirmed_at_matches_status"
  CHECK (("status" = 'confirmed') = ("confirmed_at" IS NOT NULL));

-- 3. reason wajib cocok dengan result
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_reason_matches_result"
  CHECK (
       ("result" = 'succeeded'     AND "reason" IS NULL)
    OR ("result" = 'failed'        AND "reason" = 'mock_declined')
    OR ("result" = 'not_processed' AND "reason" = 'class_full')
  );

-- 4. Data kelas waras
ALTER TABLE "trial_classes" ADD CONSTRAINT "trial_classes_capacity_fixed" CHECK ("capacity" = 4);
ALTER TABLE "trial_classes" ADD CONSTRAINT "trial_classes_price_positive" CHECK ("price_idr" > 0);
ALTER TABLE "trial_classes" ADD CONSTRAINT "trial_classes_currency_idr"   CHECK ("currency" = 'IDR');
