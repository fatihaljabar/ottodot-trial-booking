import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "@/lib/db-client";
import type { PrismaClient } from "@/generated/prisma/client";
import { createBooking, finalizeMockPayment } from "@/lib/server/booking-service";
import { createChild, createScenario, cleanupScenario, type Scenario } from "../helpers/scenario";

const GUARD_SCRIPT = fileURLToPath(new URL("../helpers/guard-lock-process.ts", import.meta.url));

// Guard berjalan sebagai proses OS TERPISAH dari Vitest, bukan hanya koneksi
// pg terpisah dalam proses yang sama — lihat komentar di guard-lock-process.ts
// untuk alasan ini wajib, bukan sekadar gaya penulisan.
function spawnGuard(
  trialClassId: string,
  holdMs: number,
): { child: ChildProcessWithoutNullStreams; exited: Promise<number | null> } {
  const child = spawn("npx", ["tsx", "--env-file=.env", GUARD_SCRIPT, trialClassId, String(holdMs)], {
    cwd: process.cwd(),
    env: process.env,
  });
  // Promise ini DIBUAT SEKARANG, sebelum caller melakukan await apa pun —
  // EventEmitter tidak memutar ulang event "exit" bagi listener yang telat
  // didaftarkan. Kalau guard sudah keluar sebelum kode lain sempat memasang
  // listener, event itu hilang selamanya dan await-nya menggantung.
  const exited = new Promise<number | null>((resolve) => {
    child.on("exit", (code) => resolve(code));
  });
  return { child, exited };
}

function waitForStdout(child: ChildProcessWithoutNullStreams, marker: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => reject(new Error(`Guard tidak mengirim "${marker}" dalam 5 detik. Buffer sejauh ini: ${buffer}`)), 5_000);
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      if (buffer.includes(marker)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.on("exit", (code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Guard proses keluar dengan code ${code} sebelum mengirim "${marker}". Buffer: ${buffer}`));
      }
    });
  });
}

describe("last-seat race (AT-06, AT-07)", () => {
  let scenario: Scenario | undefined;
  let cleanupDb: PrismaClient | undefined;

  afterEach(async () => {
    if (scenario && cleanupDb) {
      await cleanupScenario(cleanupDb, scenario.trialClassId);
      await cleanupDb.$disconnect();
    }
    scenario = undefined;
    cleanupDb = undefined;
  });

  it("AT-06: A pending lebih dulu, B commit lebih dulu, lalu A ditolak — roster tepat 4", async () => {
    cleanupDb = createPrismaClient();
    scenario = await createScenario(cleanupDb, { confirmedCount: 3 });
    const { trialClassId, parentId } = scenario;

    const studentA = await createChild(cleanupDb, parentId, "Anak A");
    const studentB = await createChild(cleanupDb, parentId, "Anak B");

    // 1. A memilih kursi terakhir dan membuat pending lebih dulu.
    const bookingA = await createBooking(cleanupDb, parentId, studentA, trialClassId);
    // 2. B memilih kelas yang sama, juga pending.
    const bookingB = await createBooking(cleanupDb, parentId, studentB, trialClassId);

    // 3. B menyelesaikan pembayaran lebih dulu (commit).
    const resultB = await finalizeMockPayment(cleanupDb, parentId, bookingB.booking.id, randomUUID(), "success");
    expect(resultB.operation.result_code).toBe("confirmed");

    // 4. A baru mengirim finalisasi setelah B sudah confirmed.
    const resultA = await finalizeMockPayment(cleanupDb, parentId, bookingA.booking.id, randomUUID(), "success");

    expect(resultA.operation.result_code).toBe("class_full");
    expect(resultA.attempt?.result).toBe("not_processed");
    expect(resultA.attempt?.reason).toBe("class_full");
    expect(resultA.booking.status).toBe("seat_unavailable");
    expect(resultB.booking.status).toBe("confirmed");

    const finalCount = await cleanupDb.booking.count({ where: { trialClassId, status: "confirmed" } });
    expect(finalCount).toBe(4);
  });

  it("AT-07: dua finalisasi BENAR-BENAR bersamaan — tepat satu confirmed, satu class_full", async () => {
    const db = createPrismaClient();
    cleanupDb = db;
    scenario = await createScenario(db, { confirmedCount: 3 });
    const { trialClassId, parentId } = scenario;

    const studentA = await createChild(db, parentId, "Anak A concurrent");
    const studentB = await createChild(db, parentId, "Anak B concurrent");
    const bookingA = await createBooking(db, parentId, studentA, trialClassId);
    const bookingB = await createBooking(db, parentId, studentB, trialClassId);

    // Guard (proses terpisah) mengunci baris kelas selama holdMs, memaksa
    // kedua panggilan finalizeMockPayment di bawah untuk benar-benar
    // menunggu pada lock yang sama secara bersamaan — bukan berurutan.
    const holdMs = 800;
    const { child: guard, exited } = spawnGuard(trialClassId, holdMs);
    let guardErr = "";
    guard.stderr.on("data", (d: Buffer) => { guardErr += d.toString(); });

    try {
      await waitForStdout(guard, "LOCKED");

      const t0 = Date.now();
      const [resultA, resultB] = await Promise.all([
        finalizeMockPayment(db, parentId, bookingA.booking.id, randomUUID(), "success"),
        finalizeMockPayment(db, parentId, bookingB.booking.id, randomUUID(), "success"),
      ]);
      const elapsed = Date.now() - t0;

      // Bukti keduanya BENAR-BENAR menunggu guard, bukan diproses lebih dulu
      // secara kebetulan: durasi total harus mendekati (bukan jauh di bawah)
      // holdMs. Toleransi 300ms untuk overhead proses/koneksi.
      expect(elapsed).toBeGreaterThanOrEqual(holdMs - 300);

      const codes = [resultA.operation.result_code, resultB.operation.result_code].sort();
      expect(codes).toEqual(["class_full", "confirmed"]);

      const attemptResults = [resultA.attempt?.result, resultB.attempt?.result].sort();
      expect(attemptResults).toEqual(["not_processed", "succeeded"]);

      const finalCount = await db.booking.count({ where: { trialClassId, status: "confirmed" } });
      expect(finalCount).toBe(4);
    } finally {
      if (guardErr) console.error("guard stderr:", guardErr);
      await exited;
    }
  });
});
