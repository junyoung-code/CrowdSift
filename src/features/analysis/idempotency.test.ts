import { describe, expect, it } from "vitest";

import { buildAnalysisIdempotencyKey } from "./idempotency";

const base = {
  rawCommentId: "raw-comment-1",
  policyVersion: 1,
  promptVersion: "commenthawk-stage1-v1",
  modelVersion: "gpt-analysis-v1",
  schemaVersion: "comment-analysis-v1",
};

describe("buildAnalysisIdempotencyKey", () => {
  it("returns the same SHA-256 key for the same analysis configuration", () => {
    expect(buildAnalysisIdempotencyKey(base)).toBe(
      buildAnalysisIdempotencyKey({ ...base }),
    );
    expect(buildAnalysisIdempotencyKey(base)).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ["policyVersion", 2],
    ["promptVersion", "commenthawk-stage1-v2"],
    ["modelVersion", "gpt-analysis-v2"],
    ["schemaVersion", "comment-analysis-v2"],
  ] as const)("changes the key when %s changes", (field, value) => {
    expect(
      buildAnalysisIdempotencyKey({
        ...base,
        [field]: value,
      }),
    ).not.toBe(buildAnalysisIdempotencyKey(base));
  });
});
