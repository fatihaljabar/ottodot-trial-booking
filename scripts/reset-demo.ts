// Reset fixture demo yang dibatasi hanya pada ID di prisma/fixtures.ts.
// Tidak pernah menyentuh data lain, tidak memakai TRUNCATE. CLI entrypoint
// untuk `npm run demo:reset`; logika yang sama juga dipakai oleh
// POST /api/demo/reset (gated di belakang DEMO_MODE) untuk tombol reset di UI.

import { createPrismaClient } from "@/lib/db-client";
import { deleteFixtures, insertFixtures } from "../prisma/fixtures";

async function main() {
  const prisma = createPrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      await deleteFixtures(tx);
      await insertFixtures(tx);
    });
    console.log("Reset selesai: fixture demo dikembalikan ke kondisi awal.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
