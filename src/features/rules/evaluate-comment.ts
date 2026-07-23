import { containsUrl, normalizeForMatching } from "./normalize-korean";
import { applyReviewFloor } from "./route-review-level";
import type {
  PhraseRule,
  RuleEvaluation,
  RuleSignal,
} from "./types";

const credentialPattern =
  /(비밀번호|인증\s*번호|로그인|계정\s*확인|otp|password|credential|verify)/iu;
const shortenedUrlPattern =
  /\b(?:https?:\/\/)?(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|url\.kr)\b/iu;
const repeatedPattern = /([a-z가-힣])\1{3,}|(.{2,})\2{2,}/iu;

const signalKindByRule: Record<
  PhraseRule["kind"],
  RuleSignal["kind"]
> = {
  blocked: "blocked_phrase",
  allowed: "allowed_phrase",
  context_exception: "context_exception",
};

const signalSeverityByRule: Record<
  PhraseRule["kind"],
  RuleSignal["severity"]
> = {
  blocked: 2,
  allowed: 0,
  context_exception: 0,
};

export const evaluateComment = ({
  engineVersion,
  phraseRules,
  text,
}: {
  text: string;
  phraseRules: PhraseRule[];
  engineVersion: string;
}): RuleEvaluation => {
  const normalizedText = normalizeForMatching(text);
  const signals: RuleSignal[] = [];

  for (const phraseRule of phraseRules) {
    if (
      phraseRule.enabled &&
      phraseRule.normalizedPhrase.length > 0 &&
      normalizedText.includes(phraseRule.normalizedPhrase)
    ) {
      signals.push({
        kind: signalKindByRule[phraseRule.kind],
        ruleId: phraseRule.id,
        severity: signalSeverityByRule[phraseRule.kind],
      });
    }
  }

  const hasUrl = containsUrl(text);
  if (hasUrl) {
    signals.push({
      kind: "suspicious_url",
      ruleId: null,
      severity: shortenedUrlPattern.test(text) ? 2 : 1,
    });
  }

  if (repeatedPattern.test(text.normalize("NFKC"))) {
    signals.push({
      kind: "repetition",
      ruleId: null,
      severity: 1,
    });
  }

  if (
    credentialPattern.test(text.normalize("NFKC")) &&
    (hasUrl || shortenedUrlPattern.test(text))
  ) {
    signals.push({
      kind: "phishing_pattern",
      ruleId: null,
      severity: 3,
    });
  }

  return {
    normalizedText,
    signals,
    initialReviewLevel: applyReviewFloor("safe", signals),
    engineVersion,
  };
};
