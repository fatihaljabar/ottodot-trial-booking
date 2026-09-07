"use client";

import { useEffect, useState } from "react";
import { listTrialClasses, getClassRoster, ApiError } from "@/lib/client/api";
import type { TrialClassView, ClassRoster } from "@/lib/contracts";

function formatWib(iso: string): string {
  return (
    new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(new Date(iso)) + " WIB"
  );
}

export default function TeacherRosterPage() {
  const [classes, setClasses] = useState<TrialClassView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roster, setRoster] = useState<ClassRoster | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Dinaikkan tiap kali roster HARUS dimuat ulang (pilihan kelas berubah,
  // atau tombol refresh ditekan) — effect di bawah cuma bereaksi ke ini.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await listTrialClasses(true);
        setClasses(res.classes);
        if (res.classes.length > 0) setSelectedId(res.classes[0].id);
      } catch {
        setError("Data belum dapat dimuat. Silakan coba lagi.");
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      try {
        const res = await getClassRoster(selectedId);
        setRoster(res);
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Roster belum dapat dimuat.");
      }
    })();
  }, [selectedId, reloadToken]);

  return (
    <main>
      <h1>Roster Kelas</h1>

      <fieldset>
        <legend>Pilih kelas</legend>
        <select value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value)} aria-label="Pilih kelas">
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} — {formatWib(c.starts_at)}
            </option>
          ))}
        </select>
      </fieldset>

      {error && <p className="error-box">{error}</p>}

      {roster && (
        <>
          <h2>
            {roster.class.title} ({roster.class.subject})
          </h2>
          <p>{formatWib(roster.class.starts_at)}</p>
          <p>
            Peserta terkonfirmasi: {roster.class.confirmed_count} dari {roster.class.capacity}
          </p>

          {roster.students.length === 0 ? (
            <p className="field-note">Belum ada peserta yang dikonfirmasi.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nama anak</th>
                  <th>Referensi booking</th>
                  <th>Waktu konfirmasi</th>
                </tr>
              </thead>
              <tbody>
                {roster.students.map((s) => (
                  <tr key={s.student_id}>
                    <td>{s.display_name}</td>
                    <td>
                      <code>{s.booking_id}</code>
                    </td>
                    <td>{new Date(s.confirmed_at).toLocaleString("id-ID")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <button onClick={() => setReloadToken((t) => t + 1)}>Muat ulang roster</button>
        </>
      )}
    </main>
  );
}
