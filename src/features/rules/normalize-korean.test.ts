import { describe, expect, it } from "vitest";

import { normalizeForMatching } from "./normalize-korean";

describe("normalizeForMatching", () => {
  it.each([
    ["사 기", "사기"],
    ["시이이이발", "시발"],
    ["ＳＰＡＭ", "spam"],
    // spacing-split evasion must not hide the elongated vowel run from the reducers
    ["진 짜  한 심 하 다 아 아", "진짜한심하다"],
    ["노 오 오 잼", "노잼"],
  ])("normalizes %s so it contains %s", (input, expected) => {
    expect(normalizeForMatching(input)).toContain(expected);
  });

  it("canonicalizes a URL without mutating the display source", () => {
    const source = "여기 https://example.com/login 확인";

    expect(normalizeForMatching(source)).toContain("__url__");
    expect(source).toBe("여기 https://example.com/login 확인");
  });
});
