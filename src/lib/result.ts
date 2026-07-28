export type AppErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "PROVIDER_PERMISSION"
  | "PROVIDER_QUOTA"
  | "PROVIDER_TRANSIENT"
  | "SCHEMA_INVALID"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL";

export type AppError = {
  code: AppErrorCode;
  message: string;
  retryable: boolean;
  providerStatus?: number;
};

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
