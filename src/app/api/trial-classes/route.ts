import type { NextRequest } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { listTrialClasses } from "@/lib/server/booking-service";
import { assertDemoMode } from "@/lib/server/demo-context";
import { includeStartedQuerySchema } from "@/lib/validation";
import { jsonEnvelope, errorEnvelope, newRequestId, toDomainError } from "@/lib/server/http";
import { DomainError } from "@/lib/server/errors";

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  try {
    assertDemoMode();
    const raw = request.nextUrl.searchParams.get("include_started") ?? undefined;
    const parsed = includeStartedQuerySchema.safeParse(raw);
    if (!parsed.success) {
      throw new DomainError("INVALID_REQUEST", "Query include_started harus 'true' atau 'false'.");
    }
    const classes = await listTrialClasses(prisma, parsed.data);
    return jsonEnvelope({ classes }, requestId);
  } catch (err) {
    return errorEnvelope(toDomainError(err), requestId);
  }
}
