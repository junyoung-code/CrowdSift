import { normalizeForMatching } from "./normalize-korean";

/**
 * Built-in deterministic lexicons for the analysis rule engine.
 *
 * These are NOT creator phrase rules and NEVER trigger an automatic moderation
 * action. A hit only emits a signal that raises the review floor to `caution`
 * and forces a second AI pass — a false positive costs one extra model look,
 * nothing more. Matching runs against the whitespace-stripped / elongation-
 * collapsed forms from `normalizeForMatching`, so spacing- and repeat-based
 * evasion ("ㅅ ㅂ", "시이이발") is folded in.
 *
 * Precision guard: only unambiguous abuse belongs here. Intensifier prefixes
 * like 개- / 존- are deliberately excluded so friendly slang (개맛있다, 존맛,
 * 미쳤다) is not flagged. Borderline sentiment words (한심, 노답, 짜증) are left
 * to the model on purpose.
 */
const toForms = (term: string) =>
  [
    ...new Set(
      normalizeForMatching(term)
        .split("|")
        .filter((form) => form.length > 0),
    ),
  ];

export const ABUSE_TERMS = [
  "시발",
  "씨발",
  "시발놈",
  "ㅅㅂ",
  "존나",
  "개새끼",
  "개색기",
  "병신",
  "ㅂㅅ",
  "븅신",
  "좆같",
  "좆나",
  "지랄",
  "닥쳐",
  "꺼져",
  "엿먹어",
  "미친놈",
  "미친년",
  "등신",
  "머저리",
  "머가리",
  "쓰레기같",
  "ㅆㄹㄱ",
  "개소리",
  "ㅉㅉ",
] as const;

export const SPAM_TERMS = [
  "맞구독",
  "무료이벤트",
  "무료구독",
  "수익보장",
  "외부메신저",
  "프로필링크",
  "프사클릭",
  "구매문의",
  "최저가",
  "카톡문의",
  "디엠주세요",
] as const;

const ABUSE_FORMS = ABUSE_TERMS.map(toForms);
const SPAM_FORMS = SPAM_TERMS.map(toForms);

const matchesLexicon = (normalizedText: string, lexiconForms: string[][]) =>
  lexiconForms.some((termForms) =>
    termForms.some((form) => normalizedText.includes(form)),
  );

export const containsAbuseTerm = (normalizedText: string) =>
  matchesLexicon(normalizedText, ABUSE_FORMS);

export const containsSpamTerm = (normalizedText: string) =>
  matchesLexicon(normalizedText, SPAM_FORMS);
