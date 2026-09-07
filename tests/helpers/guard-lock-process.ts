// Dijalankan sebagai CHILD PROCESS terpisah oleh tests/integration/concurrency.test.ts
// — bukan dalam proses Vitest yang sama.
//
// Temuan penting selama membangun tes ini: sebuah pg.Client "guard" yang
// memegang SELECT ... FOR UPDATE dalam PROSES NODE YANG SAMA dengan worker
// Prisma (@prisma/adapter-pg) tidak benar-benar memblokir worker tersebut —
// worker langsung mendapat lock seolah guard tidak menahan apa pun, meski
// guard TERBUKTI memegang row lock (dibuktikan lewat SELECT dari koneksi
// observer terpisah). Begitu guard dipindah ke proses OS terpisah, blocking
// bekerja benar dan bisa diukur lewat durasi tunggu. Kemungkinan besar ini
// interaksi antara driver `pg` mentah dan mesin query baru Prisma 7
// (@prisma/client-engine-runtime) saat keduanya berbagi satu event loop —
// bukan bug di algoritme finalizeMockPayment sendiri, yang sudah dibuktikan
// benar lewat pengukuran waktu tunggu di kedua arah (lihat AI_USAGE.md).
//
// Argumen: <trialClassId> <holdMs>
import { Client } from "pg";

async function main() {
  const [trialClassId, holdMsStr] = process.argv.slice(2);
  const holdMs = Number.parseInt(holdMsStr, 10);

  const client = new Client({ connectionString: process.env.DATABASE_URL! });
  await client.connect();
  await client.query("BEGIN");
  const res = await client.query(`SELECT id FROM trial_classes WHERE id = $1 FOR UPDATE`, [trialClassId]);
  if (res.rowCount !== 1) {
    throw new Error(`Guard tidak menemukan trial_classes dengan id ${trialClassId}`);
  }
  process.stdout.write("LOCKED\n");

  await new Promise((resolve) => setTimeout(resolve, holdMs));

  await client.query("COMMIT");
  process.stdout.write("RELEASED\n");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
