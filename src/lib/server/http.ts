import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { DomainError, mapDatabaseError } from "./errors";

export function newRequestId(): string {
  return randomUUID();
}

export function toDomainError(err: unknown): DomainError {
  return err instanceof DomainError ? err : mapDatabaseError(err);
}

// Envelope sukses/hasil bisnis — TECHNICAL §8.3. `status` default 200; caller
// mengoper status lain untuk 201 (create baru) atau hasil finalisasi (402/409).
export function jsonEnvelope<T>(data: T, requestId: string, status = 200): NextResponse {
  return NextResponse.json(
    { data, error: null, request_id: requestId },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

// Envelope error TANPA hasil bisnis — kode dari DomainError (TECHNICAL §8.4).
export function errorEnvelope(err: DomainError, requestId: string): NextResponse {
  return NextResponse.json(
    {
      data: null,
      error: { code: err.code, message: err.message, retryable: err.retryable, outcome: err.outcome },
      request_id: requestId,
    },
    { status: err.httpStatus, headers: { "Cache-Control": "no-store" } },
  );
}
