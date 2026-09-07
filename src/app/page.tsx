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
      <main>
        <p className="error-box">{loadError}</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </main>
    );
  }

  return (
    <main>
      <h1>Book a Trial Class</h1>

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
        <legend>Select a child</legend>
        {students.length === 0 && <p className="field-note">No children loaded yet.</p>}
        {students.map((s) => (
          <label key={s.id}>
            <input
              type="radio"
              name="student"
              value={s.id}
              checked={studentId === s.id}
              onChange={() => setStudentId(s.id)}
            />{" "}
            {s.display_name}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Select a trial class</legend>
        {classes.map((c) => (
          <label key={c.id} data-disabled={!c.is_bookable}>
            <input
              type="radio"
              name="class"
              value={c.id}
              disabled={!c.is_bookable}
              checked={trialClassId === c.id}
              onChange={() => setTrialClassId(c.id)}
            />{" "}
            {c.title} ({c.subject}) — {formatWib(c.starts_at)} — {formatSgd(c.price)} —{" "}
            {c.is_bookable ? `${c.available_seats} of ${c.capacity} seats left` : "Class full or already started"}
          </label>
        ))}
        <p className="field-note">
          This availability is a snapshot. The seat is only guaranteed once payment is confirmed.
        </p>
      </fieldset>

      {submitError && <p className="error-box">{submitError}</p>}

      <button onClick={handleSubmit} disabled={!parentId || !studentId || !trialClassId || submitting}>
        {submitting ? "Creating booking…" : "Create booking"}
      </button>
    </main>
  );
}
