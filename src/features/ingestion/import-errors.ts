export type ImportFailureCode =
  | "comments_disabled"
  | "quota_exceeded"
  | "permission_revoked"
  | "provider_mode_mismatch"
  | "provider_error";

export type ChannelSyncErrorCode = ImportFailureCode | "unsupported_sync_kind";

export class ImportProcessingError extends Error {
  constructor(
    public readonly code: ImportFailureCode,
    options?: ErrorOptions,
  ) {
    super(code, options);
  }
}

export class ChannelSyncProcessingError extends Error {
  constructor(
    public readonly code: ChannelSyncErrorCode,
    options?: ErrorOptions,
  ) {
    super(code, options);
  }
}

const getProviderFailure = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return { reason: null, status: null };
  }

  const response = error.response;
  if (typeof response !== "object" || response === null) {
    return { reason: null, status: null };
  }

  const status =
    "status" in response && typeof response.status === "number"
      ? response.status
      : null;
  const data = "data" in response ? response.data : null;
  const reason =
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "object" &&
    data.error !== null &&
    "errors" in data.error &&
    Array.isArray(data.error.errors) &&
    typeof data.error.errors[0] === "object" &&
    data.error.errors[0] !== null &&
    "reason" in data.error.errors[0] &&
    typeof data.error.errors[0].reason === "string"
      ? data.error.errors[0].reason
      : null;

  return { reason, status };
};

export const toChannelSyncProcessingError = (
  error: unknown,
): ChannelSyncProcessingError => {
  if (error instanceof ChannelSyncProcessingError) {
    return error;
  }
  if (error instanceof ImportProcessingError) {
    return new ChannelSyncProcessingError(error.code, { cause: error });
  }

  const { reason, status } = getProviderFailure(error);
  const code: ChannelSyncErrorCode =
    reason === "quotaExceeded" ||
    reason === "dailyLimitExceeded" ||
    status === 429
      ? "quota_exceeded"
      : reason === "authError" ||
          reason === "forbidden" ||
          reason === "insufficientPermissions" ||
          status === 401 ||
          status === 403
        ? "permission_revoked"
        : "provider_error";

  return new ChannelSyncProcessingError(code, { cause: error });
};
