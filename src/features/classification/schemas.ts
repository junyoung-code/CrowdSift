import { z } from "zod";

/**
 * 댓글 분류 파이프라인 v1 — 1단계(1-A Moderation, 1-B Luna) 계약.
 *
 * 등급은 안전 / 주의 / 위험 세 가지다. 1단계는 등급을 확정하지 않고 "후보"만 낸다.
 * 확정은 2번 분기(코드)와 3단계(Terra)가 맡는다.
 */
export const RiskLevelSchema = z.enum(["safe", "caution", "danger"]);

/**
 * 위험(danger)을 함의하는 신호. 판단 순서 1·2단계에 해당한다.
 */
export const HardRiskFlagSchema = z.enum([
  "threat", // 협박
  "stalking", // 스토킹·반복 접근
  "sexual_harassment", // 성희롱·성적 대상화
  "personal_info", // 개인정보·실제 위치 노출
  "self_harm_or_death", // 자해·죽음 유도
  "hate_speech", // 정체성 대상 혐오 표현
  "personal_attack", // 인격·존재·지능 공격
  "appearance_attack", // 외모·신체 공격
  "family_attack", // 가족·지인 공격
]);

/**
 * 주의(caution)를 함의하는 신호. 판단 순서 3단계에 해당한다.
 */
export const SoftRiskFlagSchema = z.enum([
  "profanity", // 욕설
  "vulgarity", // 비속어
  "mockery", // 조롱
  "sarcasm", // 비꼼
  "harsh_criticism", // 거친 비난
]);

/**
 * 사용자 설정이나 RAG 사례로 절대 완화할 수 없는 신호.
 * 기준 문서의 "RAG에 의존하지 않을 것" 목록과 같다.
 */
export const NON_NEGOTIABLE_RISK_FLAGS = new Set<HardRiskFlag>([
  "threat",
  "stalking",
  "sexual_harassment",
  "personal_info",
  "self_harm_or_death",
  "hate_speech",
]);

/**
 * 1-B. Luna 1차 분류 출력.
 *
 * 2차 검증이 필요한지는 모델이 정하지 않는다. 코드가 이 값들과 Moderation 결과를
 * 함께 보고 결정한다.
 */
export const LunaFirstPassSchema = z
  .object({
    candidateLevel: RiskLevelSchema,
    confidence: z.number().min(0).max(1),
    /**
     * 표현을 걷어내면 콘텐츠에 쓸 만한 내용이 남는지. 있음/없음만 본다.
     * 어떤 종류인지와 핵심 내용은 Terra 가 뽑는다.
     */
    feedbackPresent: z.boolean(),
    /**
     * 크리에이터의 위치나 일정을 안다고 내비치는 댓글인지.
     *
     * 등급을 함의하지는 않지만 안전 즉시 통과를 막는다. 작성자 이력 기능이 없는
     * 동안에는 이 한 줄만으로 스토킹 여부를 가릴 수 없어, 한 번 더 보는 쪽을 택한다.
     */
    locationOrScheduleMention: z.boolean(),
    /**
     * 채널이 민감하다고 등록한 주제를 건드리는지.
     *
     * 주제는 "외모" 같은 낱말이지만 댓글이 거기 해당하는지는 뜻을 읽어야 알 수 있어,
     * 코드가 문자열 비교로 가릴 수 없다. 등급을 올리지는 않고 즉시 통과만 막는다.
     */
    sensitiveTopicMatched: z.boolean(),
    hardRiskFlags: z.array(HardRiskFlagSchema).max(9),
    softRiskFlags: z.array(SoftRiskFlagSchema).max(5),
    matchedRules: z.array(z.string().min(1).max(80)).max(10),
  })
  .strict();

/**
 * 1-A. omni-moderation-latest 가 돌려주는 범주.
 */
export const ModerationCategorySchema = z.enum([
  "harassment",
  "harassment/threatening",
  "hate",
  "hate/threatening",
  "illicit",
  "illicit/violent",
  "self-harm",
  "self-harm/instructions",
  "self-harm/intent",
  "sexual",
  "sexual/minors",
  "violence",
  "violence/graphic",
]);

export const ModerationResultSchema = z
  .object({
    flagged: z.boolean(),
    categories: z.array(ModerationCategorySchema),
    /**
     * 우리 정책에 아직 없는 범주가 걸린 경우. 모더레이션 모델은 업데이트되면서
     * 범주가 늘어나므로, 모르는 신호를 조용히 버리지 않고 Terra 로 넘긴다.
     */
    unknownCategories: z.array(z.string().min(1)),
    categoryScores: z.record(z.string(), z.number()),
  })
  .strict();

/**
 * 사용자별 분류 프로필. 안전과 주의의 경계를 조정하는 데 쓰인다.
 * 완화 불가 신호에는 영향을 주지 못한다.
 */
export const ClassificationProfileSchema = z
  .object({
    protectionLevel: z.enum(["low", "standard", "high"]),
    allowedSlang: z.array(z.string().min(1).max(40)).max(50),
    sensitiveTopics: z.array(z.string().min(1).max(40)).max(30),
    hidePersonalAttacks: z.boolean(),
    rewriteTone: z.enum(["neutral", "friendly", "soft_disappointment"]),
    emojiFrequency: z.enum(["none", "low", "medium"]),
  })
  .strict();

export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export type HardRiskFlag = z.infer<typeof HardRiskFlagSchema>;
export type SoftRiskFlag = z.infer<typeof SoftRiskFlagSchema>;
export type LunaFirstPass = z.infer<typeof LunaFirstPassSchema>;
export type ModerationCategory = z.infer<typeof ModerationCategorySchema>;
export type ModerationResult = z.infer<typeof ModerationResultSchema>;
export type ClassificationProfile = z.infer<typeof ClassificationProfileSchema>;

export const DEFAULT_CLASSIFICATION_PROFILE: ClassificationProfile = {
  protectionLevel: "standard",
  allowedSlang: [],
  sensitiveTopics: [],
  hidePersonalAttacks: true,
  rewriteTone: "friendly",
  emojiFrequency: "low",
};
