"use client";

import { useState } from "react";
import { resetDemoData } from "@/lib/client/api";

export function ResetDemoButton() {
  const [busy, setBusy] = useState(false);

  async function handleReset() {
    if (!window.confirm("Reset all demo bookings and payment history back to the seed data?")) return;
    setBusy(true);
    try {
      await resetDemoData();
      window.location.reload();
    } catch {
      setBusy(false);
      window.alert("Could not reset demo data. Please try again.");
    }
  }

  return (
    <button className="secondary reset-demo-btn" onClick={handleReset} disabled={busy}>
      {busy ? "Resetting…" : "Reset demo data"}
    </button>
  );
}
