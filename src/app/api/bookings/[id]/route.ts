import { prisma } from "@/lib/server/prisma";
import { getBookingDetail } from "@/lib/server/booking-service";
import { assertDemoMode, getDemoParentId } from "@/lib/server/demo-context";
import { uuidSchema } from "@/lib/validation";
import { jsonEnvelope, errorEnvelope, newRequestId, toDomainError } from "@/lib/server/http";
import { DomainError } from "@/lib/server/errors";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    assertDemoMode();
    const parentId = getDemoParentId(request);
    const { id } = await params;
    const parsed = uuidSchema.safeParse(id);
    if (!parsed.success) {
      throw new DomainError("INVALID_REQUEST", "Invalid booking ID.");
    }
    const result = await getBookingDetail(prisma, parentId, parsed.data);
    return jsonEnvelope(result, requestId);
  } catch (err) {
    return errorEnvelope(toDomainError(err), requestId);
  }
}
