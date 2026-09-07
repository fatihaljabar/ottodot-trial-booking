import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizePayment, listDemoParents, ApiError } from "@/lib/client/api";

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      status,
      json: () => Promise.resolve(body),
    } as Response),
  );
}

describe("api client (BL-017) — sukses ditentukan oleh body.error, bukan HTTP status", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("HTTP 402 dengan error:null adalah HASIL BISNIS — tidak boleh throw", async () => {
    mockFetchOnce(402, {
      data: {
        booking: { status: "payment_failed" },
        operation: { result_code: "payment_failed" },
        attempt: { result: "failed" },
      },
      error: null,
      request_id: "r1",
    });

    const result = await finalizePayment("p1", "b1", "op1", "failure");
    expect(result.operation.result_code).toBe("payment_failed");
  });

  it("HTTP 409 dengan error:null (class_full) juga hasil bisnis — tidak throw", async () => {
    mockFetchOnce(409, {
      data: {
        booking: { status: "seat_unavailable" },
        operation: { result_code: "class_full" },
        attempt: { result: "not_processed" },
      },
      error: null,
      request_id: "r2",
    });

    const result = await finalizePayment("p1", "b1", "op2", "success");
    expect(result.operation.result_code).toBe("class_full");
  });

  it("body.error terisi -> ApiError dengan field yang sesuai, terlepas dari HTTP status", async () => {
    mockFetchOnce(409, {
      data: null,
      error: { code: "IDEMPOTENCY_CONFLICT", message: "Konflik.", retryable: false, outcome: "not_committed" },
      request_id: "r3",
    });

    await expect(finalizePayment("p1", "b1", "op3", "success")).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      retryable: false,
      outcome: "not_committed",
    });
  });

  it("kegagalan jaringan (fetch reject) -> ApiError RESULT_UNKNOWN/unknown, BUKAN payment_failed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));

    await expect(listDemoParents()).rejects.toMatchObject({
      code: "RESULT_UNKNOWN",
      outcome: "unknown",
      retryable: true,
    });
  });

  it("respons JSON tidak valid -> ApiError RESULT_UNKNOWN/unknown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        json: () => Promise.reject(new Error("bukan json")),
      } as unknown as Response),
    );

    await expect(listDemoParents()).rejects.toBeInstanceOf(ApiError);
  });
});
