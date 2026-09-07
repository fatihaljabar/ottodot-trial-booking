import { prisma } from "@/lib/server/prisma";
import { listStudents } from "@/lib/server/booking-service";
import { assertDemoMode, getDemoParentId } from "@/lib/server/demo-context";
import { jsonEnvelope, errorEnvelope, newRequestId, toDomainError } from "@/lib/server/http";

export async function GET(request: Request) {
  const requestId = newRequestId();
  try {
    assertDemoMode();
    const parentId = getDemoParentId(request);
    const students = await listStudents(prisma, parentId);
    return jsonEnvelope({ students }, requestId);
  } catch (err) {
    return errorEnvelope(toDomainError(err), requestId);
  }
}
