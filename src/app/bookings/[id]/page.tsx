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
    badge: "Awaiting payment",
    className: "badge-pending",
    message: "Booking recorded. The seat is confirmed once payment succeeds.",
  },
  confirmed: {
    badge: "Confirmed",
    className: "badge-confirmed",
    message: "Booking confirmed. Your child is enrolled in this class.",
  },
  payment_failed: {
    badge: "Payment failed",
    className: "badge-failed",
    message: "The simulated payment failed. The booking is not confirmed.",
  },
  seat_unavailable: {
    badge: "Class full",
    className: "badge-unavailable",
    message: "The class is full. The simulated payment was not processed.",
  },
};

// classStarted is stored as state computed whenever the booking is fetched
// (in an effect/handler) — NOT computed directly in the render body via
// Date.now(), which React treats as impure during render.
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

  // Generation counter: every mutation bumps it; responses from a stale
  // generation are discarded (DESIGN §5.3) so a late GET/POST can't
  // downgrade an already-known terminal status.
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    (async () => {
      const stored = getStoredParentId();
      if (!stored) {
        if (generationRef.current !== generation) return;
        setLoadError("Please select a parent profile first.");
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
        setLoadError(err instanceof ApiError ? err.message : "Data could not be loaded. Please try again.");
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
        // Response lost/timed out — KEEP the stored key, don't mint a new one.
        setUiState("outcome_unknown");
      } else {
        // Error with a known outcome (e.g. IDEMPOTENCY_CONFLICT, NOT_FOUND):
        // this key will never be valid again, safe to discard.
        sessionStorage.removeItem(pendingOperationKey(parentId, bookingId));
        setPendingOp(null);
        setUiState("idle");
        setLoadError(err instanceof ApiError ? err.message : "The payment could not be processed.");
      }
    }
  }

  function handleCheckResult() {
    if (!pendingOp) return;
    runPayment(pendingOp.outcome, pendingOp.operationId);
  }

  if (!booking) {
    return <main className="page">{loadError ? <p className="error-box">{loadError}</p> : <p>Loading…</p>}</main>;
  }

  const status = STATUS_LABEL[booking.status];
  const paymentUiState = derivePaymentUiState(booking.status, pendingOp);
  const showPaymentPanel = paymentUiState !== "terminal" && !classStarted;

  return (
    <main className="page" aria-live="polite">
      <h1>Booking Detail</h1>
      <p>
        Reference: <code>{booking.id}</code>
      </p>
      <p>Child: {booking.student.display_name}</p>
      <p>
        Class: {booking.class.title} ({booking.class.subject})
      </p>
      <p>
        Simulated amount:{" "}
        {new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 }).format(
          booking.class.price,
        )}
      </p>

      <h2>Status</h2>
      <p>
        <span className={`badge ${status.className}`}>{status.badge}</span>
      </p>
      <p>{status.message}</p>

      {uiState === "processing" && <p>Processing simulated payment…</p>}

      {uiState === "outcome_unknown" && (
        <div className="error-box">
          <p>The result is not yet known. Check the booking status before trying a new payment.</p>
          <button onClick={handleCheckResult}>Check result</button>
        </div>
      )}

      {loadError && <p className="error-box">{loadError}</p>}

      {showPaymentPanel && uiState === "idle" && (
        <fieldset>
          <legend>Simulated payment</legend>
          {paymentUiState === "must_resolve_pending" ? (
            <>
              <p className="field-note">A previous payment attempt is still unresolved.</p>
              <button onClick={handleCheckResult}>Check result</button>
            </>
          ) : (
            <>
              <button onClick={() => runPayment("success")}>Simulate successful payment</button>{" "}
              <button className="secondary" onClick={() => runPayment("failure")}>
                Simulate failed payment
              </button>
            </>
          )}
        </fieldset>
      )}

      <h2>Payment attempt history</h2>
      {booking.payment_attempts.length === 0 ? (
        <p className="field-note">No attempts yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Result</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {booking.payment_attempts.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.created_at).toLocaleString("en-SG")}</td>
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
