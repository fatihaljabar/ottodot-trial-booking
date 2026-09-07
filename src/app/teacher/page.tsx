"use client";

import { useEffect, useState } from "react";
import { listTrialClasses, getClassRoster, ApiError } from "@/lib/client/api";
import type { TrialClassView, ClassRoster } from "@/lib/contracts";

function formatWib(iso: string): string {
  return (
    new Intl.DateTimeFormat("en-SG", {
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
  // Bumped whenever the roster MUST reload (class selection changes, or the
  // refresh button is pressed) — the effect below just reacts to this.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await listTrialClasses(true);
        setClasses(res.classes);
        if (res.classes.length > 0) setSelectedId(res.classes[0].id);
      } catch {
        setError("Data could not be loaded. Please try again.");
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
        setError(err instanceof ApiError ? err.message : "The roster could not be loaded.");
      }
    })();
  }, [selectedId, reloadToken]);

  return (
    <main>
      <h1>Class Roster</h1>

      <fieldset>
        <legend>Select a class</legend>
        <select value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value)} aria-label="Select a class">
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
            Confirmed participants: {roster.class.confirmed_count} of {roster.class.capacity}
          </p>

          {roster.students.length === 0 ? (
            <p className="field-note">No participants confirmed yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Child name</th>
                  <th>Booking reference</th>
                  <th>Confirmed at</th>
                </tr>
              </thead>
              <tbody>
                {roster.students.map((s) => (
                  <tr key={s.student_id}>
                    <td>{s.display_name}</td>
                    <td>
                      <code>{s.booking_id}</code>
                    </td>
                    <td>{new Date(s.confirmed_at).toLocaleString("en-SG")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <button onClick={() => setReloadToken((t) => t + 1)}>Refresh roster</button>
        </>
      )}
    </main>
  );
}
