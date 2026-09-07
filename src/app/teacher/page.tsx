"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

function shortenId(id: string): string {
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function TeacherRosterPage() {
  const [classes, setClasses] = useState<TrialClassView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roster, setRoster] = useState<ClassRoster | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
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
      setRefreshing(true);
      try {
        const res = await getClassRoster(selectedId);
        setRoster(res);
        setLastUpdated(new Date());
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "The roster could not be loaded.");
      } finally {
        setRefreshing(false);
      }
    })();
  }, [selectedId, reloadToken]);

  const fillPct = roster ? Math.round((roster.class.confirmed_count / roster.class.capacity) * 100) : 0;

  return (
    <main className="roster-shell">
      <div className="roster-header">
        <h1>Class Attendance &amp; Teacher Roster</h1>
        <p>Review confirmed participants and monitor class capacity in real time.</p>

        <label className="field-label" htmlFor="class-select">
          Select session
        </label>
        <select
          id="class-select"
          className="roster-select"
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} ({c.subject}) — {formatWib(c.starts_at)}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="error-box">{error}</p>}

      {roster && (
        <>
          <div className="metric-strip">
            <div className="panel">
              <h3>Confirmed students</h3>
              <div className="metric-value">
                {roster.class.confirmed_count} / {roster.class.capacity}
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${fillPct}%` }} />
              </div>
            </div>

            <div className="panel">
              <h3>Capacity status</h3>
              <span className={`badge ${roster.class.is_bookable ? "badge-open" : "badge-full"}`}>
                {roster.class.is_bookable
                  ? `${roster.class.available_seats} seat${roster.class.available_seats === 1 ? "" : "s"} open`
                  : "Full"}
              </span>
            </div>

            <div className="panel">
              <h3>Quick actions</h3>
              <button onClick={() => setReloadToken((t) => t + 1)} disabled={refreshing}>
                {refreshing ? "Refreshing…" : "Refresh roster"}
              </button>
              <p className="field-note">
                {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString("en-SG")}` : ""}
              </p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Student name</th>
                <th>Booking reference</th>
                <th>Confirmed at</th>
                <th>Payment status</th>
              </tr>
            </thead>
            <tbody>
              {roster.students.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-roster">
                      <div className="empty-icon">📋</div>
                      <p>
                        No participants confirmed for this session yet. New students appear here automatically once
                        their trial payment succeeds.
                      </p>
                      <Link href="/">
                        <button className="secondary">Open booking page to simulate a payment</button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                roster.students.map((s) => (
                  <tr key={s.student_id}>
                    <td>
                      <span className="roster-row-name">
                        <span className="avatar">{initials(s.display_name)}</span>
                        {s.display_name}
                      </span>
                    </td>
                    <td className="ref-code">{shortenId(s.booking_id)}</td>
                    <td>{new Date(s.confirmed_at).toLocaleString("en-SG")}</td>
                    <td>
                      <span className="badge badge-confirmed">Paid</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
