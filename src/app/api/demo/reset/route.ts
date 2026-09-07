import { prisma } from "@/lib/server/prisma";
import { assertDemoMode } from "@/lib/server/demo-context";
import { jsonEnvelope, errorEnvelope, newRequestId, toDomainError } from "@/lib/server/http";
import { deleteFixtures, insertFixtures } from "../../../../../prisma/fixtures";

export async function POST() {
  const requestId = newRequestId();
  try {
    assertDemoMode();
    await prisma.$transaction(async (tx) => {
      await deleteFixtures(tx);
      await insertFixtures(tx);
    });
    return jsonEnvelope({ reset: true }, requestId);
  } catch (err) {
    return errorEnvelope(toDomainError(err), requestId);
  }
}
