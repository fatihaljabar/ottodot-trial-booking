"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getBookingDetail, finalizePayment, ApiError } from "@/lib/client/api";
import { getStoredParentId } from "@/lib/client/demo-parent";
import {
  pendingOperationKey,
  serializePendingOperation,
  parsePendingOperation,
  derivePaymentUiState,
  type PendingOperation,
} from "@/lib/client/payment-state";
import type { BookingView, BookingStatus, MockOutcome } from "@/lib/contracts";

type UiState = "idle" | "processing" | "outcome_unknown";

const STATUS_LABEL: Record<BookingStatus, { badge: string; className: string; message: string }> = {
  pending_payment: {
    badge: "Menunggu pembayaran",
    className: "badge-pending",
    message: "Booking tercatat. Kursi dipastikan setelah booking berhasil dikonfirmasi.",
  },
  confirmed: {
    badge: "Confirmed",
    className: "badge-confirmed",
    message: "Booking berhasil dikonfirmasi. Anak Anda sudah terdaftar di kelas ini.",
  },
  payment_failed: {
    badge: "Pembayaran gagal",
    className: "badge-failed",
    message: "Pembayaran simulasi gagal. Booking belum dikonfirmasi.",
  },
  seat_unavailable: {
    badge: "Kelas penuh",
    className: "badge-unavailable",
    message: "Kelas sudah penuh. Pembayaran simulasi tidak diproses.",
  },
};

// classStarted disimpan sebagai state yang dihitung setiap kali booking
// diterima (di effect/handler) — BUKAN dihitung langsung di badan render
// lewat Date.now(), yang React anggap impure untuk fase render.
function hasClassStarted(startsAtIso: string): boolean {
  return new Date(startsAtIso).getTime() <= Date.now();
}

export default function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const bookingId = params.id;

  const [parentId, setParentId] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingView | null>(null);
  const [classStarted, setClassStarted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uiState, setUiState] = useState<UiState>("idle");
  const [pendingOp, setPendingOp] = useState<PendingOperation | null>(null);

  // Nomor generasi: setiap mutation menaikkannya; respons dari generasi lama
  // diabaikan (DESIGN §5.3) supaya GET/POST yang tiba terlambat tidak
  // menurunkan status terminal yang sudah diketahui.
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    (async () => {
      const stored = getStoredParentId();
      if (!stored) {
        if (generationRef.current !== generation) return;
        setLoadError("Pilih profil orang tua terlebih dahulu.");
        return;
      }
      setPendingOp(parsePendingOperation(sessionStorage.getItem(pendingOperationKey(stored, bookingId))));
      try {
        const res = await getBookingDetail(stored, bookingId);
        if (generationRef.current !== generation) return;
        setParentId(stored);
        setBooking(res.booking);
        setClassStarted(hasClassStarted(res.booking.class.starts_at));
        setLoadError(null);
      } catch (err) {
        if (generationRef.current !== generation) return;
        setLoadError(err instanceof ApiError ? err.message : "Data belum dapat dimuat. Silakan coba lagi.");
      }
    })();
  }, [bookingId]);

  async function runPayment(outcome: MockOutcome, operationId?: string) {
    if (!parentId) return;
    const opId = operationId ?? crypto.randomUUID();
    const op: PendingOperation = { parentId, bookingId, operationId: opId, outcome };
    sessionStorage.setItem(pendingOperationKey(parentId, bookingId), serializePendingOperation(op));
    setPendingOp(op);
    setUiState("processing");
    setLoadError(null);

    const generation = ++generationRef.current;
    try {
      const result = await finalizePayment(parentId, bookingId, opId, outcome);
      if (generationRef.current !== generation) return;
      sessionStorage.removeItem(pendingOperationKey(parentId, bookingId));
      setPendingOp(null);
      setBooking(result.booking);
      setClassStarted(hasClassStarted(result.booking.class.starts_at));
      setUiState("idle");
    } catch (err) {
      if (generationRef.current !== generation) return;
      if (err instanceof ApiError && err.outcome === "unknown") {
        // Respons hilang/timeout — PERTAHANKAN key tersimpan, jangan buat baru.
        setUiState("outcome_unknown");
      } else {
        // Error dengan kepastian hasil (mis. IDEMPOTENCY_CONFLICT, NOT_FOUND):
        // key ini tidak akan pernah valid lagi, aman dibuang.
        sessionStorage.removeItem(pendingOperationKey(parentId, bookingId));
        setPendingOp(null);
        setUiState("idle");
        setLoadError(err instanceof ApiError ? err.message : "Pembayaran gagal diproses.");
      }
    }
  }

  function handleCheckResult() {
    if (!pendingOp) return;
    runPayment(pendingOp.outcome, pendingOp.operationId);
  }

  if (!booking) {
    return <main>{loadError ? <p className="error-box">{loadError}</p> : <p>Memuat…</p>}</main>;
  }

  const status = STATUS_LABEL[booking.status];
  const paymentUiState = derivePaymentUiState(booking.status, pendingOp);
  const showPaymentPanel = paymentUiState !== "terminal" && !classStarted;

  return (
    <main aria-live="polite">
      <h1>Detail Booking</h1>
      <p>
        Referensi: <code>{booking.id}</code>
      </p>
      <p>Anak: {booking.student.display_name}</p>
      <p>
        Kelas: {booking.class.title} ({booking.class.subject})
      </p>
      <p>Nominal simulasi: Rp{booking.class.price_idr.toLocaleString("id-ID")}</p>

      <h2>Status</h2>
      <p>
        <span className={`badge ${status.className}`}>{status.badge}</span>
      </p>
      <p>{status.message}</p>

      {uiState === "processing" && <p>Sedang memproses pembayaran simulasi…</p>}

      {uiState === "outcome_unknown" && (
        <div className="error-box">
          <p>Hasil belum dapat dipastikan. Periksa status booking sebelum mencoba pembayaran baru.</p>
          <button onClick={handleCheckResult}>Periksa hasil</button>
        </div>
      )}

      {loadError && <p className="error-box">{loadError}</p>}

      {showPaymentPanel && uiState === "idle" && (
        <fieldset>
          <legend>Pembayaran simulasi</legend>
          {paymentUiState === "must_resolve_pending" ? (
            <>
              <p className="field-note">Ada operasi pembayaran sebelumnya yang belum dipastikan hasilnya.</p>
              <button onClick={handleCheckResult}>Periksa hasil</button>
            </>
          ) : (
            <>
              <button onClick={() => runPayment("success")}>Simulasikan pembayaran berhasil</button>{" "}
              <button className="secondary" onClick={() => runPayment("failure")}>
                Simulasikan pembayaran gagal
              </button>
            </>
          )}
        </fieldset>
      )}

      <h2>Riwayat percobaan pembayaran</h2>
      {booking.payment_attempts.length === 0 ? (
        <p className="field-note">Belum ada percobaan.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Hasil</th>
              <th>Alasan</th>
            </tr>
          </thead>
          <tbody>
            {booking.payment_attempts.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.created_at).toLocaleString("id-ID")}</td>
                <td>{a.result}</td>
                <td>{a.reason ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
