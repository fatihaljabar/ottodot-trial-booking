-- Ganti mata uang demo dari IDR ke SGD; nama kolom disesuaikan supaya tidak
-- lagi menyesatkan (price_idr/amount_idr sekarang menyimpan SGD).
-- RENAME COLUMN dipakai secara eksplisit (bukan drop+add) supaya data yang
-- sudah ada tidak hilang.

ALTER TABLE "trial_classes" RENAME COLUMN "price_idr" TO "price";
ALTER TABLE "payment_attempts" RENAME COLUMN "amount_idr" TO "amount";

-- Constraint lama (mewajibkan 'IDR') harus dilepas SEBELUM data diubah ke
-- 'SGD', jika tidak UPDATE di bawah akan ditolak oleh constraint itu sendiri.
ALTER TABLE "trial_classes" DROP CONSTRAINT "trial_classes_currency_idr";

-- Konstanta demo lama (IDR 50.000) diganti SGD 50 pada baris yang masih
-- memakai nilai lama, supaya fixture demo konsisten dengan currency barunya.
UPDATE "trial_classes" SET "price" = 50 WHERE "price" = 50000;
UPDATE "payment_attempts" SET "amount" = 50 WHERE "amount" = 50000;
UPDATE "trial_classes" SET "currency" = 'SGD' WHERE "currency" = 'IDR';
UPDATE "payment_attempts" SET "currency" = 'SGD' WHERE "currency" = 'IDR';

ALTER TABLE "trial_classes" ALTER COLUMN "price" SET DEFAULT 50;
ALTER TABLE "trial_classes" ALTER COLUMN "currency" SET DEFAULT 'SGD';
ALTER TABLE "trial_classes" ADD CONSTRAINT "trial_classes_currency_sgd" CHECK ("currency" = 'SGD');
