// Tipe domain publik. Cocok persis dengan bentuk JSON di TECHNICAL.md bagian 8.2.
// snake_case karena ini bentuk yang dikirim lewat HTTP, bukan konvensi kode TS biasa.

export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "payment_failed"
  | "seat_unavailable";

export type MockOutcome = "success" | "failure";

export type AttemptResult = "succeeded" | "failed" | "not_processed";

export type OperationResult =
  | "confirmed"
  | "payment_failed"
  | "class_full"
  | "already_confirmed"
  | "already_unavailable";

export type ParentSummary = {
  id: string;
  display_name: string;
};

export type StudentSummary = {
  id: string;
  display_name: string;
  parent_id: string;
};

export type TrialClassView = {
  id: string;
  title: string;
  subject: "science" | "math";
  starts_at: string;
  timezone: "Asia/Jakarta";
  capacity: 4;
  price_idr: number;
  currency: "IDR";
  confirmed_count: number;
  available_seats: number;
  is_bookable: boolean;
};

export type PaymentAttemptView = {
  id: string;
  operation_id: string;
  result: AttemptResult;
  reason: "mock_declined" | "class_full" | null;
  amount_idr: number;
  currency: "IDR";
  created_at: string;
};

export type BookingView = {
  id: string;
  student: StudentSummary;
  class: TrialClassView;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  payment_attempts: PaymentAttemptView[];
};

export type OperationView = {
  operation_id: string;
  requested_outcome: MockOutcome;
  result_code: OperationResult;
  created_at: string;
  replayed: boolean;
};

export type RosterStudent = {
  student_id: string;
  display_name: string;
  booking_id: string;
  confirmed_at: string;
};

export type ClassRoster = {
  class: TrialClassView;
  students: RosterStudent[];
};

export type FinalizeMockPaymentResult = {
  booking: BookingView;
  operation: OperationView;
  attempt: PaymentAttemptView | null;
};
