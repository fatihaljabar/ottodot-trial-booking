import { prisma } from "@/lib/server/prisma";
import { getClassRoster } from "@/lib/server/booking-service";
import { assertDemoMode } from "@/lib/server/demo-context";
import { uuidSchema } from "@/lib/validation";
import { jsonEnvelope, errorEnvelope, newRequestId, toDomainError } from "@/lib/server/http";
import { DomainError } from "@/lib/server/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    assertDemoMode();
    const { id } = await params;
    const parsed = uuidSchema.safeParse(id);
    if (!parsed.success) {
      throw new DomainError("INVALID_REQUEST", "Invalid class ID.");
    }
    const roster = await getClassRoster(prisma, parsed.data);
    return jsonEnvelope(roster, requestId);
  } catch (err) {
    return errorEnvelope(toDomainError(err), requestId);
  }
}
