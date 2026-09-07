import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ottodot Trial Booking",
  description: "Demo booking kelas trial — Ottodot take-home",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id">
      <body>
        <nav>
          <Link href="/">Pemilihan</Link>
          <Link href="/teacher">Roster Guru</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
