// Query invariant read-only — TECHNICAL.md bagian 13. Keluar dengan exit code
// non-zero bila ada baris yang menunjukkan pelanggaran; exit 0 bila bersih.

import { createPrismaClient } from "@/lib/db-client";

const QUERIES: { name: string; sql: string }[] = [
  {
    name: "Kapasitas: kelas dengan >4 confirmed",
    sql: `
      SELECT trial_class_id, count(*) AS confirmed_count
      FROM bookings WHERE status = 'confirmed'
      GROUP BY trial_class_id HAVING count(*) > 4
    `,
  },
  {
    name: "Booking kanonis: pasangan anak-kelas dengan >1 booking",
    sql: `
      SELECT student_id, trial_class_id, count(*) AS booking_count
      FROM bookings GROUP BY student_id, trial_class_id HAVING count(*) > 1
    `,
  },
  {
    name: "Kesesuaian confirmed <-> pembayaran sukses",
    sql: `
      SELECT b.id, b.status, count(a.id) FILTER (WHERE a.result = 'succeeded') AS success_count
      FROM bookings b LEFT JOIN payment_attempts a ON a.booking_id = b.id
      GROUP BY b.id, b.status
      HAVING (b.status = 'confirmed' AND count(a.id) FILTER (WHERE a.result = 'succeeded') <> 1)
          OR (b.status <> 'confirmed' AND count(a.id) FILTER (WHERE a.result = 'succeeded') <> 0)
    `,
  },
  {
    name: "Kesesuaian receipt <-> attempt",
    sql: `
      SELECT o.operation_id, o.result_code, a.result, a.reason
      FROM payment_operations o
      JOIN bookings b ON b.id = o.booking_id
      LEFT JOIN payment_attempts a ON a.operation_id = o.operation_id
      WHERE (o.result_code IN ('already_confirmed', 'already_unavailable') AND a.id IS NOT NULL)
         OR (o.result_code = 'confirmed' AND (a.id IS NULL OR a.result IS DISTINCT FROM 'succeeded'))
         OR (o.result_code = 'payment_failed' AND (a.id IS NULL OR a.result IS DISTINCT FROM 'failed'))
         OR (o.result_code = 'class_full' AND (a.id IS NULL OR a.result IS DISTINCT FROM 'not_processed'))
         OR (o.result_code = 'already_confirmed' AND b.status <> 'confirmed')
         OR (o.result_code = 'already_unavailable' AND b.status <> 'seat_unavailable')
    `,
  },
];

async function main() {
  const db = createPrismaClient();
  let violations = 0;
  try {
    for (const q of QUERIES) {
      const rows = await db.$queryRawUnsafe<unknown[]>(q.sql);
      if (rows.length > 0) {
        violations += rows.length;
        console.error(`✗ ${q.name}: ${rows.length} pelanggaran`);
        console.error(rows);
      } else {
        console.log(`✓ ${q.name}: bersih`);
      }
    }
  } finally {
    await db.$disconnect();
  }
  if (violations > 0) {
    console.error(`\nTotal ${violations} pelanggaran invariant ditemukan.`);
    process.exit(1);
  }
  console.log("\nSemua invariant terjaga.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
