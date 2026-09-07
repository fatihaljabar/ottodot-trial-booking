"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listDemoParents,
  listStudents,
  listTrialClasses,
  createBooking,
  ApiError,
} from "@/lib/client/api";
import { getStoredParentId, setStoredParentId } from "@/lib/client/demo-parent";
import type { ParentSummary, StudentSummary, TrialClassView } from "@/lib/contracts";

function formatWib(iso: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso)) + " WIB";
}

function formatSgd(amount: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 }).format(amount);
}

function seatsPill(c: TrialClassView): { label: string; className: string } {
  if (!c.is_bookable) {
    return { label: "Class full or started", className: "pill-unavailable" };
  }
  if (c.available_seats <= 1) {
    return { label: `Only ${c.available_seats} seat left!`, className: "pill-warning" };
  }
  return { label: `${c.available_seats} of ${c.capacity} seats left`, className: "pill-neutral" };
}

export default function SelectionPage() {
  const router = useRouter();

  const [parents, setParents] = useState<ParentSummary[]>([]);
  const [parentId, setParentId] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [classes, setClasses] = useState<TrialClassView[]>([]);
  const [trialClassId, setTrialClassId] = useState<string | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load demo parents + classes once on mount; active parent comes from THIS
  // tab's sessionStorage (not localStorage) — TECHNICAL §3.3.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [parentsRes, classesRes] = await Promise.all([listDemoParents(), listTrialClasses()]);
        if (cancelled) return;
        setParents(parentsRes.parents);
        setClasses(classesRes.classes);
        const stored = getStoredParentId();
        if (stored && parentsRes.parents.some((p) => p.id === stored)) {
          setParentId(stored);
        } else if (parentsRes.parents.length > 0) {
          setParentId(parentsRes.parents[0].id);
        }
      } catch {
        if (!cancelled) setLoadError("Data could not be loaded. Please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset the selected child when the profile changes — done DURING render
  // (React's "adjusting state during render" pattern), not in useEffect,
  // to avoid a synchronous setState in the effect body.
  const [lastParentId, setLastParentId] = useState<string | null>(null);
  if (parentId !== lastParentId) {
    setLastParentId(parentId);
    setStudentId(null);
  }

  // Reload children whenever the profile changes.
  useEffect(() => {
    if (!parentId) return;
    setStoredParentId(parentId);
    let cancelled = false;
    (async () => {
      try {
        const res = await listStudents(parentId);
        if (!cancelled) setStudents(res.students);
      } catch {
        if (!cancelled) setLoadError("Data could not be loaded. Please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [parentId]);

  async function handleSubmit() {
    if (!parentId || !studentId || !trialClassId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createBooking(parentId, studentId, trialClassId);
      router.push(`/bookings/${result.booking.id}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not create the booking. Please try again.";
      setSubmitError(message);
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <main className="page">
        <p className="error-box">{loadError}</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </main>
    );
  }

  const selectedStudent = students.find((s) => s.id === studentId) ?? null;
  const selectedClass = classes.find((c) => c.id === trialClassId) ?? null;
  const canSubmit = !!(parentId && studentId && trialClassId) && !submitting;

  return (
    <main className="booking-shell">
      <div className="hero">
        <h1>Book a Trial Class for Your Child</h1>
        <p>Experience our interactive STEM curriculum. Select a child and a live session to reserve a trial seat.</p>
      </div>

      <div className="booking-grid">
        <div>
          <fieldset>
            <legend>Parent profile</legend>
            <select
              value={parentId ?? ""}
              onChange={(e) => setParentId(e.target.value)}
              aria-label="Select parent profile"
            >
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
            <p className="field-note">Demo profile, not a login.</p>
          </fieldset>

          <fieldset>
            <legend>Step 1 — Select the attending child</legend>
            {students.length === 0 && <p className="field-note">No children loaded yet.</p>}
            <div className="option-grid">
              {students.map((s) => (
                <label key={s.id} className="card-option">
                  <input
                    type="radio"
                    name="student"
                    value={s.id}
                    checked={studentId === s.id}
                    onChange={() => setStudentId(s.id)}
                  />
                  <span className="check-badge" aria-hidden="true">
                    ✓
                  </span>
                  <div className="option-title">{s.display_name}</div>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Step 2 — Available trial sessions</legend>
            {classes.map((c) => {
              const pill = seatsPill(c);
              return (
                <label
                  key={c.id}
                  className="card-option class-option"
                  data-disabled={!c.is_bookable}
                  style={{ marginBottom: "0.75rem" }}
                >
                  <input
                    type="radio"
                    name="class"
                    value={c.id}
                    disabled={!c.is_bookable}
                    checked={trialClassId === c.id}
                    onChange={() => setTrialClassId(c.id)}
                  />
                  <span className="check-badge" aria-hidden="true">
                    ✓
                  </span>
                  <div className="option-title">
                    {c.title} ({c.subject})
                  </div>
                  <div className="option-schedule">{formatWib(c.starts_at)}</div>
                  <div className="option-footer">
                    <span className="price">{formatSgd(c.price)} / child</span>
                    <span className={`pill ${pill.className}`}>{pill.label}</span>
                  </div>
                </label>
              );
            })}
            <p className="field-note">
              This availability is a snapshot. The seat is only guaranteed once payment is confirmed.
            </p>
          </fieldset>
        </div>

        <aside className="summary-panel panel">
          <h3>Order summary</h3>

          {selectedStudent ? (
            <div className="summary-row">
              <span>Child</span>
              <span>{selectedStudent.display_name}</span>
            </div>
          ) : (
            <p className="summary-empty">Select a child to continue.</p>
          )}

          {selectedClass ? (
            <>
              <div className="summary-row">
                <span>Session</span>
                <span>{selectedClass.title}</span>
              </div>
              <div className="summary-row">
                <span>Schedule</span>
                <span>{formatWib(selectedClass.starts_at)}</span>
              </div>
              <div className="summary-row total">
                <span>Total due</span>
                <span>{formatSgd(selectedClass.price)}</span>
              </div>
            </>
          ) : (
            <p className="summary-empty">Select a trial session to see the total.</p>
          )}

          {submitError && <p className="error-box">{submitError}</p>}

          <button
            className="primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{ marginTop: "1rem" }}
          >
            {submitting ? "Creating booking…" : "Confirm & create booking"}
          </button>
        </aside>
      </div>
    </main>
  );
}
