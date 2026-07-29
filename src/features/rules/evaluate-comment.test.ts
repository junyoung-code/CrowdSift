import { describe, expect, it } from "vitest";

import { evaluateComment } from "./evaluate-comment";
import { applyReviewFloor } from "./route-review-level";
import type { PhraseRule } from "./types";

const rule = (
  kind: PhraseRule["kind"],
  normalizedPhrase: string,
): PhraseRule => ({
  id: `${kind}-${normalizedPhrase}`,
  kind,
  normalizedPhrase,
  contextNote: null,
  enabled: true,
  version: 1,
});

describe("evaluateComment", () => {
  it("routes a blocked phrase with an allowed context to caution", () => {
    const result = evaluateComment({
      text: "우리끼리는 이 표현을 칭찬으로 써요",
      engineVersion: "rules-v1",
      phraseRules: [
        rule("blocked", "이표현"),
        rule("context_exception", "우리끼리는이표현을칭찬"),
      ],
    });

    expect(result.initialReviewLevel).toBe("caution");
    expect(result.signals.map((signal) => signal.kind)).toEqual(
      expect.arrayContaining(["blocked_phrase", "context_exception"]),
    );
  });

  it("routes a credential request with a shortened URL to risk", () => {
    const result = evaluateComment({
      text: "계정 확인을 위해 비밀번호를 https://bit.ly/account 에 입력하세요",
      engineVersion: "rules-v1",
      phraseRules: [],
    });

    expect(result.initialReviewLevel).toBe("risk");
    expect(result.signals).toContainEqual(
      expect.objectContaining({ kind: "phishing_pattern", severity: 3 }),
    );
  });

  it("does not mark a blocked phrase alone as risk", () => {
    const result = evaluateComment({
      text: "이 표현이 들어간 댓글",
      engineVersion: "rules-v1",
      phraseRules: [rule("blocked", "이표현")],
    });

    expect(result.initialReviewLevel).toBe("caution");
  });

  it("raises obfuscated abuse to caution without any creator phrase rule", () => {
    const result = evaluateComment({
      text: "이런 ㅆㄹㄱ 같은 걸 영상이라고 올렸냐",
      engineVersion: "rules-v1",
      phraseRules: [],
    });

    expect(result.initialReviewLevel).toBe("caution");
    expect(result.signals.map((signal) => signal.kind)).toContain(
      "abuse_lexicon",
    );
  });

  it("does not flag friendly slang as abuse", () => {
    const result = evaluateComment({
      text: "와 이건 진짜 개맛있겠다 존맛 ㅁㅊ",
      engineVersion: "rules-v1",
      phraseRules: [],
    });

    expect(result.initialReviewLevel).toBe("safe");
    expect(result.signals).toEqual([]);
  });

  it("treats a credential lure with no link as phishing", () => {
    const result = evaluateComment({
      text: "공식 당첨 확인을 위해 계정 비밀번호를 입력하세요",
      engineVersion: "rules-v1",
      phraseRules: [],
    });

    expect(result.initialReviewLevel).toBe("risk");
    expect(result.signals).toContainEqual(
      expect.objectContaining({ kind: "phishing_pattern", severity: 2 }),
    );
  });

  it("flags a twice-repeated copy-paste advertisement", () => {
    const result = evaluateComment({
      text: "제 페이지도 방문해 주세요 제 페이지도 방문해 주세요",
      engineVersion: "rules-v1",
      phraseRules: [],
    });

    expect(result.signals.map((signal) => signal.kind)).toContain(
      "repetition",
    );
  });
});

describe("applyReviewFloor", () => {
  it("does not allow a model to downgrade a phishing rule to safe", () => {
    expect(
      applyReviewFloor("safe", [
        { kind: "phishing_pattern", ruleId: null, severity: 3 },
      ]),
    ).toBe("risk");
  });

  it("preserves a higher model level", () => {
    expect(
      applyReviewFloor("risk", [
        { kind: "suspicious_url", ruleId: null, severity: 1 },
      ]),
    ).toBe("risk");
  });

  it.each(["allowed_phrase", "context_exception"] as const)(
    "does not raise review level for %s provenance alone",
    (kind) => {
      expect(
        applyReviewFloor("safe", [
          { kind, ruleId: "rule-1", severity: 0 },
        ]),
      ).toBe("safe");
    },
  );
});
