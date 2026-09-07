"use client";

// Wrapper fetch tipis ke API aplikasi. Mengikuti aturan TECHNICAL §8.3: sukses
// ditentukan oleh body.error === null, BUKAN oleh HTTP status — 402/409 pada
// finalisasi tetap membawa data bisnis dan bukan kegagalan transport.

import type {
  ParentSummary,
  StudentSummary,
  TrialClassView,
  BookingView,
  ClassRoster,
  MockOutcome,
  FinalizeMockPaymentResult,
} from "@/lib/contracts";

export type ApiErrorBody = {
  code: string;
  message: string;
  retryable: boolean;
  outcome: "not_committed" | "unknown";
};

export class ApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly outcome: "not_committed" | "unknown";

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
    this.retryable = body.retryable;
    this.outcome = body.outcome;
  }
}

function demoHeaders(parentId: string): Record<string, string> {
  return { "X-Demo-Parent-Id": parentId };
}

async function callApi<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store" });
  } catch {
    // Kegagalan jaringan — hasil belum diketahui, BUKAN payment_failed (BR-13).
    throw new ApiError({
      code: "RESULT_UNKNOWN",
      message: "Could not connect to the server.",
      retryable: true,
      outcome: "unknown",
    });
  }

  let body: { data: T | null; error: ApiErrorBody | null };
  try {
    body = await res.json();
  } catch {
    throw new ApiError({
      code: "RESULT_UNKNOWN",
      message: "The server response could not be read.",
      retryable: true,
      outcome: "unknown",
    });
  }

  if (body.error) {
    throw new ApiError(body.error);
  }
  return body.data as T;
}

export function listDemoParents(): Promise<{ parents: ParentSummary[] }> {
  return callApi("/api/demo/parents");
}

export function listStudents(parentId: string): Promise<{ students: StudentSummary[] }> {
  return callApi("/api/students", { headers: demoHeaders(parentId) });
}

export function listTrialClasses(includeStarted = false): Promise<{ classes: TrialClassView[] }> {
  const qs = includeStarted ? "?include_started=true" : "";
  return callApi(`/api/trial-classes${qs}`);
}

export function createBooking(
  parentId: string,
  studentId: string,
  trialClassId: string,
): Promise<{ booking: BookingView; created: boolean }> {
  return callApi("/api/bookings", {
    method: "POST",
    headers: { ...demoHeaders(parentId), "Content-Type": "application/json" },
    body: JSON.stringify({ student_id: studentId, trial_class_id: trialClassId }),
  });
}

export function getBookingDetail(parentId: string, bookingId: string): Promise<{ booking: BookingView }> {
  return callApi(`/api/bookings/${bookingId}`, { headers: demoHeaders(parentId) });
}

export function finalizePayment(
  parentId: string,
  bookingId: string,
  operationId: string,
  outcome: MockOutcome,
): Promise<FinalizeMockPaymentResult> {
  return callApi(`/api/bookings/${bookingId}/payment`, {
    method: "POST",
    headers: {
      ...demoHeaders(parentId),
      "Content-Type": "application/json",
      "Idempotency-Key": operationId,
    },
    body: JSON.stringify({ outcome }),
  });
}

export function getClassRoster(trialClassId: string): Promise<ClassRoster> {
  return callApi(`/api/trial-classes/${trialClassId}/roster`);
}
