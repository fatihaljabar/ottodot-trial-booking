
// Kode error tanpa hasil bisnis. Tabel TECHNICAL.md bagian 8.4.
export type DomainErrorCode =
  | "INVALID_REQUEST"
  | "DEMO_CONTEXT_REQUIRED"
  | "NOT_FOUND"
  | "CLASS_FULL"
  | "CLASS_STARTED"
  | "IDEMPOTENCY_CONFLICT"
  | "DATABASE_BUSY"
  | "RESULT_UNKNOWN"
  | "INTERNAL_ERROR"
  | "DEMO_DISABLED";

const HTTP_STATUS: Record<DomainErrorCode, number> = {
  INVALID_REQUEST: 400,
  DEMO_CONTEXT_REQUIRED: 400,
  NOT_FOUND: 404,
  CLASS_FULL: 409,
  CLASS_STARTED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  DATABASE_BUSY: 503,
  RESULT_UNKNOWN: 503,
  INTERNAL_ERROR: 500,
  DEMO_DISABLED: 404,
};

// "not_committed" bila sistem yakin request ini tidak commit apa pun;
// "unknown" hanya untuk RESULT_UNKNOWN, saat respons hilang sebelum diketahui.
const OUTCOME: Record<DomainErrorCode, "not_committed" | "unknown"> = {
  INVALID_REQUEST: "not_committed",
  DEMO_CONTEXT_REQUIRED: "not_committed",
  NOT_FOUND: "not_committed",
  CLASS_FULL: "not_committed",
  CLASS_STARTED: "not_committed",
  IDEMPOTENCY_CONFLICT: "not_committed",
  DATABASE_BUSY: "not_committed",
  RESULT_UNKNOWN: "unknown",
  INTERNAL_ERROR: "not_committed",
  DEMO_DISABLED: "not_committed",
};

const RETRYABLE: Record<DomainErrorCode, boolean> = {
  INVALID_REQUEST: false,
  DEMO_CONTEXT_REQUIRED: false,
  NOT_FOUND: false,
  CLASS_FULL: false,
  CLASS_STARTED: false,
  IDEMPOTENCY_CONFLICT: false,
  DATABASE_BUSY: true,
  RESULT_UNKNOWN: true,
  INTERNAL_ERROR: false,
  DEMO_DISABLED: false,
};

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly outcome: "not_committed" | "unknown";

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.httpStatus = HTTP_STATUS[code];
    this.retryable = RETRYABLE[code];
    this.outcome = OUTCOME[code];
  }
}

// SQLSTATE 55P03 (lock_not_available) dan 40P01 (deadlock_detected) — TECHNICAL §8.4.
// Prisma driver adapter melampirkan kode Postgres asli pada properti `code`
// milik error yang dilempar `$queryRaw`/`$executeRaw` saat transaksi rollback.
export function mapDatabaseError(err: unknown): DomainError {
  const pgCode = (err as { code?: string } | null)?.code;
  if (pgCode === "55P03" || pgCode === "40P01") {
    return new DomainError("DATABASE_BUSY", "Database sedang sibuk, coba lagi.");
  }
  return new DomainError("INTERNAL_ERROR", "Terjadi kesalahan internal.");
}
