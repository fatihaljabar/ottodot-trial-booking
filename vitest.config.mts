import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/helpers/env-setup.ts"],
    // Tes integrasi menyentuh Postgres asli dan barrier concurrency menunggu
    // lock sungguhan — beri ruang lebih dari default 5 detik Vitest.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
