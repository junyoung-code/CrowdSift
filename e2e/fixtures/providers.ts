export const FIXTURE_LABEL = "TEST FIXTURE";
export const FIXTURE_CREATOR_EMAIL = "creator@example.com";
export const FIXTURE_CHANNEL_NAME = "테스트 크리에이터 채널";
export const FIXTURE_VIDEO_NAME = "첫 번째 테스트 영상";

export const FIXTURE_ERROR_STATES = [
  "no-channel",
  "no-video",
  "comments-disabled",
  "revoked-token",
  "quota-exhausted",
  "partial-import",
  "openai-429",
  "schema-invalid-twice",
  "moderation-scope-missing",
] as const;

export type FixtureErrorState = (typeof FIXTURE_ERROR_STATES)[number];
