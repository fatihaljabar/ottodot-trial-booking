import { createPrismaClient } from "@/lib/db-client";
import { FIXTURE_IDS, insertFixtures } from "./fixtures";

async function main() {
  const prisma = createPrismaClient();
  try {
    const existing = await prisma.parent.findUnique({ where: { id: FIXTURE_IDS.PARENT_A } });
    if (existing) {
      console.error(
        "Fixture demo sudah ada (PARENT_A ditemukan). Jalankan `npm run demo:reset` " +
          "lebih dulu jika ingin mengulang dari kondisi awal.",
      );
      process.exit(1);
    }

    await prisma.$transaction(async (tx) => {
      await insertFixtures(tx);
    });

    console.log("Seed selesai:");
    console.log("- 3 parent, 6 student, 2 trial class");
    console.log("- AVAILABLE: 0 confirmed (1 payment_failed milik CHILD_A2)");
    console.log("- LAST_SEAT: 3 confirmed (SEED_1, SEED_2, SEED_3)");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
