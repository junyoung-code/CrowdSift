import {
  containsAbuseTerm,
  containsSpamTerm,
} from "./korean-lexicon";
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
// Prize / account-action lures that make a credential request phishing even
// with no link (e.g. "당첨 확인을 위해 계정 비밀번호를 입력하세요").
const phishingLurePattern =
  /(당첨|지급|보상|본인\s*인증|계정\s*(?:확인|정지|인증)|공식\s*(?:확인|인증)|보안\s*확인)/iu;
const repeatedPattern = /([a-z가-힣])\1{3,}|(.{2,})\2{2,}/iu;
// A 6+ char block repeated back-to-back — copy-paste ads that only repeat twice
// (below the 3x threshold above), matched on whitespace-stripped text.
const phraseRepeatPattern = /(.{6,}?)\1/u;

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

  if (containsAbuseTerm(normalizedText)) {
    signals.push({
      kind: "abuse_lexicon",
      ruleId: null,
      severity: 2,
    });
  }

  if (containsSpamTerm(normalizedText)) {
    signals.push({
      kind: "spam_lexicon",
      ruleId: null,
      severity: 1,
    });
  }

  const hasUrl = containsUrl(text);
  if (hasUrl) {
    signals.push({
      kind: "suspicious_url",
      ruleId: null,
      severity: shortenedUrlPattern.test(text) ? 2 : 1,
    });
  }

  const normalizedForm = text.normalize("NFKC");
  const collapsedText = normalizedForm.replace(/\s+/g, "");
  if (
    repeatedPattern.test(normalizedForm) ||
    phraseRepeatPattern.test(collapsedText)
  ) {
    signals.push({
      kind: "repetition",
      ruleId: null,
      severity: 1,
    });
  }

  const hasShortenedUrl = shortenedUrlPattern.test(text);
  if (
    credentialPattern.test(normalizedForm) &&
    (hasUrl || hasShortenedUrl || phishingLurePattern.test(normalizedForm))
  ) {
    signals.push({
      kind: "phishing_pattern",
      ruleId: null,
      severity: hasUrl || hasShortenedUrl ? 3 : 2,
    });
  }

  return {
    normalizedText,
    signals,
    initialReviewLevel: applyReviewFloor("safe", signals),
    engineVersion,
  };
};
