const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

export type ClassificationFailureCode =
  | "openai_rate_limited"
  | "openai_quota_exceeded"
  | "openai_auth_failed"
  | "openai_unavailable"
  | "classification_failed";

const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
]);

export const toClassificationFailureCode = (
  error: unknown,
): ClassificationFailureCode => {
  const record = asRecord(error);
  const nested = asRecord(record.error);
  const status = typeof record.status === "number" ? record.status : null;
  const code =
    typeof nested.code === "string"
      ? nested.code
      : typeof record.code === "string"
        ? record.code
        : null;

  if (status === 401 || status === 403 || code === "invalid_api_key") {
    return "openai_auth_failed";
  }
  if (code === "insufficient_quota") {
    return "openai_quota_exceeded";
  }
  if (status === 429 || code === "rate_limit_exceeded") {
    return "openai_rate_limited";
  }
  if (
    (status !== null && status >= 500) ||
    (code !== null && TRANSIENT_NETWORK_CODES.has(code)) ||
    record.name === "APIConnectionError" ||
    record.name === "APIConnectionTimeoutError"
  ) {
    return "openai_unavailable";
  }
  return "classification_failed";
};

export const isRetryableClassificationFailure = (
  code: string | null,
) => code === "openai_rate_limited" || code === "openai_unavailable";
