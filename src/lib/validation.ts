import { z } from "zod";

// UUID path/header params.
export const uuidSchema = z.uuid();

// Body kontrak POST /api/bookings — .strict() menolak field di luar kontrak
// (mis. status, parent_id yang disisipkan) sesuai TECHNICAL §8.1.
export const createBookingBodySchema = z
  .object({
    student_id: z.uuid(),
    trial_class_id: z.uuid(),
  })
  .strict();

// Body kontrak POST /api/bookings/:id/payment.
export const paymentBodySchema = z
  .object({
    outcome: z.enum(["success", "failure"]),
  })
  .strict();

// Query ?include_started= pada GET /api/trial-classes — hanya menerima
// "true"/"false" persis, default false (TECHNICAL §8.1).
export const includeStartedQuerySchema = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => v === "true");
