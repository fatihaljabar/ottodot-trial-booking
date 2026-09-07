import { prisma } from "@/lib/server/prisma";
import { createBooking } from "@/lib/server/booking-service";
import { assertDemoMode, getDemoParentId } from "@/lib/server/demo-context";
import { createBookingBodySchema } from "@/lib/validation";
import { jsonEnvelope, errorEnvelope, newRequestId, toDomainError } from "@/lib/server/http";
import { DomainError } from "@/lib/server/errors";

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    assertDemoMode();
    const parentId = getDemoParentId(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new DomainError("INVALID_REQUEST", "Body JSON tidak valid.");
    }
    const parsed = createBookingBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new DomainError("INVALID_REQUEST", "student_id/trial_class_id tidak valid.");
    }

    const result = await createBooking(prisma, parentId, parsed.data.student_id, parsed.data.trial_class_id);
    return jsonEnvelope(result, requestId, result.created ? 201 : 200);
  } catch (err) {
    return errorEnvelope(toDomainError(err), requestId);
  }
}
