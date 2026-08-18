const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

const GOOGLE_RECONNECT_ERROR_CODES = new Set([
  "invalid_grant",
  "invalid_rapt",
]);

const GOOGLE_RECONNECT_REASONS = new Set([
  "authError",
  "insufficientPermissions",
]);

export class YouTubeOAuthReconnectRequiredError extends Error {
  readonly code = "youtube_oauth_reconnect_required";

  constructor(message = "YouTube OAuth reconnect required", options?: ErrorOptions) {
    super(message, options);
    this.name = "YouTubeOAuthReconnectRequiredError";
  }
}

const getGoogleOAuthFailure = (error: unknown) => {
  const response = asRecord(asRecord(error).response);
  const data = asRecord(response.data);
  const nestedError = asRecord(data.error);
  const errors = Array.isArray(nestedError.errors)
    ? nestedError.errors
    : [];
  const firstReason = asRecord(errors[0]).reason;

  return {
    status: typeof response.status === "number" ? response.status : null,
    oauthCode: typeof data.error === "string" ? data.error : null,
    reason: typeof firstReason === "string" ? firstReason : null,
  };
};

/**
 * 자동 재시도로 회복되지 않고 사용자가 Google 권한을 다시 연결해야 하는 실패인지
 * 판별한다. 할당량·일시적 provider 오류와 섞으면 정상 연결까지 끊을 수 있으므로
 * OAuth token endpoint의 영구 오류와 명시적인 인증 실패만 포함한다.
 */
export const isYouTubeOAuthReconnectRequiredError = (error: unknown) => {
  if (error instanceof YouTubeOAuthReconnectRequiredError) {
    return true;
  }

  const { oauthCode, reason, status } = getGoogleOAuthFailure(error);
  return (
    (oauthCode !== null && GOOGLE_RECONNECT_ERROR_CODES.has(oauthCode)) ||
    (reason !== null && GOOGLE_RECONNECT_REASONS.has(reason)) ||
    status === 401
  );
};

export const assertRefreshTokenAvailable = (input: {
  expiresAt: string | null;
  refreshToken: string | null;
  now?: number;
}) => {
  if (!input.expiresAt || input.refreshToken) {
    return;
  }

  const expiresAt = new Date(input.expiresAt).getTime();
  const now = input.now ?? Date.now();
  // google-auth-library의 기본 eager refresh 경계와 맞춘다. 아직 몇 초 남은 token을
  // API 호출에 태웠다가 요청 중 만료시키는 대신 재연결로 보낸다.
  if (!Number.isFinite(expiresAt) || expiresAt > now + 5 * 60 * 1000) {
    return;
  }

  throw new YouTubeOAuthReconnectRequiredError(
    "Expired YouTube access token has no refresh token",
  );
};
