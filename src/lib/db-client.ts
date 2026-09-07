// Factory PrismaClient tanpa "server-only" — dipakai oleh src/lib/server/prisma.ts
// (yang menambah guard dan singleton untuk app Next.js) DAN oleh script/tes
// (prisma/seed.ts, scripts/*.ts, tests/*) yang berjalan lewat tsx/vitest,
// bukan lewat build Next.js, sehingga tidak boleh mengimpor modul "server-only".

import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL tidak diset");
  }
  const pool = new Pool({ connectionString });
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

export type { PrismaClient };
