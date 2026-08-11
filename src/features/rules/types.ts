export type ReviewLevel = "safe" | "caution" | "risk";

export type RuleSignalKind =
  | "blocked_phrase"
  | "allowed_phrase"
  | "context_exception"
  | "repetition"
  | "suspicious_url"
  | "phishing_pattern"
  | "abuse_lexicon"
  | "spam_lexicon";

export type PhraseRule = {
  id: string;
  kind: "blocked" | "allowed" | "context_exception";
  normalizedPhrase: string;
  contextNote: string | null;
  enabled: boolean;
  version: number;
};

export type RuleSignal = {
  kind: RuleSignalKind;
  ruleId: string | null;
  severity: 0 | 1 | 2 | 3;
};

export type RuleEvaluation = {
  normalizedText: string;
  signals: RuleSignal[];
  initialReviewLevel: ReviewLevel;
  engineVersion: string;
};
