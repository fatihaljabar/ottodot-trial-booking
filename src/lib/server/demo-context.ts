import { DomainError } from "./errors";
import { uuidSchema } from "@/lib/validation";

// DEMO_MODE harus eksplisit "true". Tidak beralih diam-diam ke mode publik
// bila env tidak diset atau salah ketik (TECHNICAL §3).
export function assertDemoMode(): void {
  if (process.env.DEMO_MODE !== "true") {
    throw new DomainError("DEMO_DISABLED", "Demo endpoint is not active.");
  }
}

// Header X-Demo-Parent-Id adalah konteks demo, BUKAN autentikasi — bisa
// diganti siapa saja. Service layer tetap memvalidasi kepemilikan lewat
// relasi database (TECHNICAL §3.3); ini hanya memvalidasi bentuknya.
export function getDemoParentId(request: Request): string {
  const header = request.headers.get("x-demo-parent-id");
  if (!header) {
    throw new DomainError("DEMO_CONTEXT_REQUIRED", "Please select a parent profile first.");
  }
  const parsed = uuidSchema.safeParse(header);
  if (!parsed.success) {
    throw new DomainError("INVALID_REQUEST", "The X-Demo-Parent-Id header is invalid.");
  }
  return parsed.data;
}
