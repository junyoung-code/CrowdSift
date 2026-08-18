import { describe, expect, it } from "vitest";

import {
  isRetryableClassificationFailure,
  toClassificationFailureCode,
} from "./classification-errors";

describe("classification provider failures", () => {
  it.each([
    [{ status: 429 }, "openai_rate_limited"],
    [{ status: 500 }, "openai_unavailable"],
    [{ name: "APIConnectionError" }, "openai_unavailable"],
    [{ status: 401 }, "openai_auth_failed"],
    [{ status: 429, error: { code: "insufficient_quota" } }, "openai_quota_exceeded"],
    [new Error("invalid schema"), "classification_failed"],
  ] as const)("maps %# to %s", (error, expected) => {
    expect(toClassificationFailureCode(error)).toBe(expected);
  });

  it("retries only rate limits and temporary OpenAI availability failures", () => {
    expect(isRetryableClassificationFailure("openai_rate_limited")).toBe(true);
    expect(isRetryableClassificationFailure("openai_unavailable")).toBe(true);
    expect(isRetryableClassificationFailure("openai_auth_failed")).toBe(false);
    expect(isRetryableClassificationFailure("openai_quota_exceeded")).toBe(false);
  });
});
