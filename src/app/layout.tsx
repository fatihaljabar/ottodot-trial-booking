import type { Metadata } from "next";
import { NavLinks } from "./nav-links";
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
          <span className="brand">Ottodot</span>
          <NavLinks />
        </nav>
        {children}
      </body>
    </html>
  );
}
