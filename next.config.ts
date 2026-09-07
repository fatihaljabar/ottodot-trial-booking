import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CLAUDE.md adalah dokumen kerja yang kami tulis dan kelola sendiri;
  // matikan agar `next dev` tidak menyisipkan blok agent-rules ke dalamnya.
  agentRules: false,
};

export default nextConfig;
