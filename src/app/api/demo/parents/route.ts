import { prisma } from "@/lib/server/prisma";
import { listDemoParents } from "@/lib/server/booking-service";
import { assertDemoMode } from "@/lib/server/demo-context";
import { jsonEnvelope, errorEnvelope, newRequestId, toDomainError } from "@/lib/server/http";

export async function GET() {
  const requestId = newRequestId();
  try {
    assertDemoMode();
    const parents = await listDemoParents(prisma);
    return jsonEnvelope({ parents }, requestId);
  } catch (err) {
    return errorEnvelope(toDomainError(err), requestId);
  }
}
