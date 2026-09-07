import "server-only";
import { createPrismaClient, type PrismaClient } from "@/lib/db-client";

declare global {
  var __prisma: PrismaClient | undefined;
}

// Singleton per proses. Next.js dev server melakukan hot-reload modul; tanpa
// ini setiap reload membuka pool koneksi baru sampai database habis.
export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
