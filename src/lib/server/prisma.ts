import "server-only";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  var __prisma: PrismaClient | undefined;
  var __pgPool: Pool | undefined;
}

const pool =
  globalThis.__pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

// Singleton per proses. Next.js dev server melakukan hot-reload modul; tanpa
// ini setiap reload membuka pool koneksi baru sampai database habis.
export const prisma = globalThis.__prisma ?? new PrismaClient({ adapter: new PrismaPg(pool) });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
  globalThis.__pgPool = pool;
}
