import { describe, expect, it } from "vitest";
import {
  derivePaymentUiState,
  parsePendingOperation,
  serializePendingOperation,
  pendingOperationKey,
  type PendingOperation,
} from "@/lib/client/payment-state";

describe("payment-state (BL-017)", () => {
  it("kunci sessionStorage disambiguasi per parent + booking", () => {
    const k1 = pendingOperationKey("parent-a", "booking-1");
    const k2 = pendingOperationKey("parent-b", "booking-1");
    expect(k1).not.toBe(k2);
  });

  it("serialize lalu parse mengembalikan objek yang sama", () => {
    const op: PendingOperation = {
      parentId: "p1",
      bookingId: "b1",
      operationId: "op1",
      outcome: "success",
    };
    const parsed = parsePendingOperation(serializePendingOperation(op));
    expect(parsed).toEqual(op);
  });

  it("parse mengembalikan null untuk input yang bukan JSON valid", () => {
    expect(parsePendingOperation("bukan json")).toBeNull();
  });

  it("parse mengembalikan null untuk null/kosong", () => {
    expect(parsePendingOperation(null)).toBeNull();
    expect(parsePendingOperation("")).toBeNull();
  });

  it("parse menolak objek yang bentuknya tidak lengkap", () => {
    expect(parsePendingOperation(JSON.stringify({ parentId: "p1" }))).toBeNull();
    expect(parsePendingOperation(JSON.stringify({ parentId: "p1", bookingId: "b1", operationId: "o1", outcome: "maybe" }))).toBeNull();
  });

  it("confirmed dan seat_unavailable selalu terminal, terlepas dari operasi tersimpan", () => {
    const op: PendingOperation = { parentId: "p", bookingId: "b", operationId: "o", outcome: "success" };
    expect(derivePaymentUiState("confirmed", op)).toBe("terminal");
    expect(derivePaymentUiState("confirmed", null)).toBe("terminal");
    expect(derivePaymentUiState("seat_unavailable", op)).toBe("terminal");
  });

  it("DP-03: payment_failed dengan operasi tersimpan HARUS diselesaikan dulu, bukan langsung boleh key baru", () => {
    const pendingOp: PendingOperation = { parentId: "p", bookingId: "b", operationId: "o", outcome: "success" };
    // Ini kasus persis yang dijelaskan TECHNICAL §9.2: booking.status sudah
    // payment_failed dari attempt SEBELUMNYA, tapi operasi TERBARU belum
    // selesai — booking.status saja tidak cukup untuk mengizinkan key baru.
    expect(derivePaymentUiState("payment_failed", pendingOp)).toBe("must_resolve_pending");
  });

  it("pending_payment atau payment_failed TANPA operasi tersimpan boleh mulai/coba lagi", () => {
    expect(derivePaymentUiState("pending_payment", null)).toBe("can_start");
    expect(derivePaymentUiState("payment_failed", null)).toBe("can_start");
  });
});
