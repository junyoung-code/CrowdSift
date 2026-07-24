export type ImportFailureCode =
  | "comments_disabled"
  | "quota_exceeded"
  | "permission_revoked"
  | "provider_error";

export class ImportProcessingError extends Error {
  constructor(
    public readonly code: ImportFailureCode,
    options?: ErrorOptions,
  ) {
    super(code, options);
  }
}
