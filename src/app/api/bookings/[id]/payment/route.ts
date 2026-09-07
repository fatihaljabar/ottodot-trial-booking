import { prisma } from "@/lib/server/prisma";
import { finalizeMockPayment } from "@/lib/server/booking-service";
import { assertDemoMode, getDemoParentId } from "@/lib/server/demo-context";
import { uuidSchema, paymentBodySchema } from "@/lib/validation";
import { jsonEnvelope, errorEnvelope, newRequestId, toDomainError } from "@/lib/server/http";
import { DomainError } from "@/lib/server/errors";
import type { OperationResult } from "@/lib/contracts";

// Tabel HTTP status per result_code — TECHNICAL §8.3. Hasil bisnis (termasuk
// 402/409) tetap error:null; status HTTP di sini bukan penanda error transport.
const HTTP_STATUS_BY_RESULT: Record<OperationResult, number> = {
  confirmed: 200,
  payment_failed: 402,
  class_full: 409,
  already_confirmed: 200,
  already_unavailable: 409,
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    assertDemoMode();
    const parentId = getDemoParentId(request);
    const { id } = await params;

    const bookingIdParsed = uuidSchema.safeParse(id);
    if (!bookingIdParsed.success) {
      throw new DomainError("INVALID_REQUEST", "Invalid booking ID.");
    }

    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new DomainError("INVALID_REQUEST", "The Idempotency-Key header is required.");
    }
    const opIdParsed = uuidSchema.safeParse(idempotencyKey);
    if (!opIdParsed.success) {
      throw new DomainError("INVALID_REQUEST", "Idempotency-Key must be a UUID.");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new DomainError("INVALID_REQUEST", "Invalid JSON body.");
    }
    const bodyParsed = paymentBodySchema.safeParse(body);
    if (!bodyParsed.success) {
      throw new DomainError("INVALID_REQUEST", "outcome must be 'success' or 'failure'.");
    }

    const result = await finalizeMockPayment(
      prisma,
      parentId,
      bookingIdParsed.data,
      opIdParsed.data,
      bodyParsed.data.outcome,
    );
    const status = HTTP_STATUS_BY_RESULT[result.operation.result_code];
    return jsonEnvelope(result, requestId, status);
  } catch (err) {
    return errorEnvelope(toDomainError(err), requestId);
  }
}
