// Logika murni (tanpa I/O) untuk state pembayaran di layar booking — dipisah
// dari komponen React supaya bisa diuji unit langsung (BL-017).

import type { BookingStatus, MockOutcome } from "@/lib/contracts";

export type PendingOperation = {
  parentId: string;
  bookingId: string;
  operationId: string;
  outcome: MockOutcome;
};

export function pendingOperationKey(parentId: string, bookingId: string): string {
  return `ottodot:pending-op:${parentId}:${bookingId}`;
}

export function serializePendingOperation(op: PendingOperation): string {
  return JSON.stringify(op);
}

export function parsePendingOperation(raw: string | null): PendingOperation | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingOperation>;
    if (
      typeof parsed.parentId === "string" &&
      typeof parsed.bookingId === "string" &&
      typeof parsed.operationId === "string" &&
      (parsed.outcome === "success" || parsed.outcome === "failure")
    ) {
      return parsed as PendingOperation;
    }
    return null;
  } catch {
    return null;
  }
}

export type PaymentUiState = "terminal" | "must_resolve_pending" | "can_start";

/**
 * DP-03: selama ada operasi tersimpan yang belum diketahui hasilnya, UI tidak
 * boleh membuat key baru — booking.status = payment_failed SAJA tidak cukup
 * untuk mengizinkan percobaan baru, karena bisa jadi operasi TERBARU (yang
 * hasilnya belum sampai ke client) belum selesai (TECHNICAL §9.2).
 */
export function derivePaymentUiState(
  bookingStatus: BookingStatus,
  pendingOp: PendingOperation | null,
): PaymentUiState {
  if (bookingStatus === "confirmed" || bookingStatus === "seat_unavailable") {
    return "terminal";
  }
  if (pendingOp) {
    return "must_resolve_pending";
  }
  return "can_start";
}
