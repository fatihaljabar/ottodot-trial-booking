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
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso)) + " WIB";
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
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

  // Muat profil demo + kelas sekali di awal; profil aktif diambil dari
  // sessionStorage TAB ini (bukan localStorage) — TECHNICAL §3.3.
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
        if (!cancelled) setLoadError("Data belum dapat dimuat. Silakan coba lagi.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset pilihan anak saat profil berganti — dilakukan SELAMA render
  // (pola "adjusting state during render" React), bukan di useEffect,
  // supaya tidak memicu setState sinkron di badan effect.
  const [lastParentId, setLastParentId] = useState<string | null>(null);
  if (parentId !== lastParentId) {
    setLastParentId(parentId);
    setStudentId(null);
  }

  // Muat ulang anak setiap kali profil berganti.
  useEffect(() => {
    if (!parentId) return;
    setStoredParentId(parentId);
    let cancelled = false;
    (async () => {
      try {
        const res = await listStudents(parentId);
        if (!cancelled) setStudents(res.students);
      } catch {
        if (!cancelled) setLoadError("Data belum dapat dimuat. Silakan coba lagi.");
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
      const message = err instanceof ApiError ? err.message : "Booking gagal dibuat. Silakan coba lagi.";
      setSubmitError(message);
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <main>
        <p className="error-box">{loadError}</p>
        <button onClick={() => window.location.reload()}>Muat ulang</button>
      </main>
    );
  }

  return (
    <main>
      <h1>Booking Kelas Trial</h1>

      <fieldset>
        <legend>Profil orang tua</legend>
        <select
          value={parentId ?? ""}
          onChange={(e) => setParentId(e.target.value)}
          aria-label="Pilih profil orang tua"
        >
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
        <p className="field-note">Profil demo, bukan login.</p>
      </fieldset>

      <fieldset>
        <legend>Pilih anak</legend>
        {students.length === 0 && <p className="field-note">Anak belum dimuat atau belum ada.</p>}
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
        <legend>Pilih kelas trial</legend>
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
            {c.title} ({c.subject}) — {formatWib(c.starts_at)} — {formatRupiah(c.price_idr)} —{" "}
            {c.is_bookable ? `${c.available_seats} kursi tersisa dari ${c.capacity}` : "Kelas penuh atau sudah dimulai"}
          </label>
        ))}
        <p className="field-note">
          Ketersediaan ini adalah cuplikan saat ini. Kursi baru dipastikan setelah pembayaran berhasil dikonfirmasi.
        </p>
      </fieldset>

      {submitError && <p className="error-box">{submitError}</p>}

      <button onClick={handleSubmit} disabled={!parentId || !studentId || !trialClassId || submitting}>
        {submitting ? "Sedang memproses booking…" : "Buat booking"}
      </button>
    </main>
  );
}
