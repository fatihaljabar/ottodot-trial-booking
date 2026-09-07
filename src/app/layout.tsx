import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ottodot Trial Booking",
  description: "Trial class booking demo — Ottodot take-home",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Booking</Link>
          <Link href="/teacher">Teacher Roster</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
