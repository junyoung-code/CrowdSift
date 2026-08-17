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
 * 후보 등급을 얼마나 믿을 수 있는지.
 *
 * 0~1 소수로 받던 것을 세 단계로 바꿨다. 실측 90건에서 소수 값이 0.95~0.99 에
 * 89건 몰렸고, 틀린 판단에도 0.98~0.99 가 붙었다. 눈금이 촘촘한 것과 눈금이
 * 뜻을 갖는 것은 다르다. 값의 개수를 줄이는 대신 각 값에 판별 가능한 뜻을 준다.
 */
export const CertaintySchema = z.enum([
  /** 근거가 댓글 본문에 있고 달리 읽을 여지가 없다. */
  "clear",
  /** 두 등급 사이에 있다. 어느 쪽으로 읽어도 말이 되지만 한쪽이 조금 더 그럴듯하다. */
  "borderline",
  /** 댓글 한 줄만으로는 가릴 수 없다. 더 넓은 맥락이 있어야 한다. */
  "unclear",
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
    certainty: CertaintySchema,
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
 * 기획서 6번의 분류 사유 코드. 크리에이터에게 "왜 이 등급인지" 보여줄 때 쓴다.
 */
export const ReasonCodeSchema = z.enum([
  "profanity", // 욕설
  "vulgarity", // 비속어
  "mockery", // 조롱
  "sarcasm", // 비꼼
  "personal_attack", // 개인 공격
  "appearance_attack", // 외모 공격
  "family_attack", // 가족 공격
  "sexual_harassment", // 성희롱
  "hate_speech", // 혐오 표현
  "threat", // 협박
  "stalking", // 스토킹
  "personal_info", // 개인정보 노출
  "self_harm_or_death", // 자해·죽음 유도
]);

/**
 * 기획서 6번의 권장 처리 방식. **제안이며 실행이 아니다.**
 * 삭제·차단·신고는 사용자가 확인해야 일어난다.
 */
export const RecommendedActionSchema = z.enum([
  "show_source", // 원문 표시
  "show_rewritten_only", // 순화된 내용만 표시
  "hide_source", // 원문 숨김
  "consider_delete", // 삭제 검토
  "consider_block", // 차단 검토
  "consider_report", // 신고 검토
  "preserve_evidence", // 증거 보관
  "notify_now", // 즉시 알림
]);

/**
 * 피드백의 성격. 있음/없음은 Luna 가 이미 봤고, 여기서는 종류를 가른다.
 */
export const FeedbackTypeSchema = z.enum([
  "actionable", // 고칠 수 있는 문제 지적
  "preference", // 선호나 비교
  "question", // 정보 요청
  "none",
]);

/**
 * 3. Terra 2차 검증 출력.
 *
 * **최종 등급이 아니다.** Terra 는 자기 판단만 내고, 코드가 Luna 후보·Moderation
 * 최소 등급과 함께 읽어 확정한다. Terra 는 Luna 의 답을 보지 못한 채 판단한다.
 */
export const TerraVerdictSchema = z
  .object({
    /** Terra 자신의 등급 판단. Luna 후보와 같을 수도, 다를 수도 있다. */
    verdictLevel: RiskLevelSchema,
    certainty: CertaintySchema,
    reasonCodes: z.array(ReasonCodeSchema).max(13),
    hardRiskFlags: z.array(HardRiskFlagSchema).max(9),
    softRiskFlags: z.array(SoftRiskFlagSchema).max(5),
    feedbackType: FeedbackTypeSchema,
    /** 순화를 만들어도 되는지. false 면 4단계를 부르지 않는다. */
    feedbackActionable: z.boolean(),
    /**
     * 순화의 재료. 공격 표현을 걷어낸 뒤 남는 핵심만 적는다.
     * 없으면 null 이다. 빈 문자열과 구분하려고 nullable 로 둔다.
     */
    feedbackCore: z.string().min(1).max(200).nullable(),
    recommendedActions: z.array(RecommendedActionSchema).max(8),
    /**
     * 작성자 본인이 힘들다고 털어놓는 경우. 크리에이터를 향한 공격이 아니므로
     * 등급과 별개 경로로 다룬다. 크리에이터에게 죽음을 권하는 것은 여기가 아니라
     * hardRiskFlags 의 self_harm_or_death 다.
     */
    safetyCase: z.boolean(),
  })
  .strict();

/**
 * 순화문의 말투. 기획서 3번 「AI 순화 지침」의 세 갈래를 그대로 옮겼다.
 *
 * 무작위로 고르는 것이 아니라 원문의 내용과 감정에 맞는 것을 고른다.
 */
export const ToneVariantSchema = z.enum([
  "neutral", // 차분하고 일반적인 말투
  "friendly", // ! : ) ^^ 등을 가볍게 사용
  "soft_disappointment", // 아쉬움을 부드럽게
]);

/**
 * 4. Luna 순화 출력.
 *
 * 최종 등급이 주의이고 순화할 재료가 있는 댓글에만 만든다. 위험 댓글에는 만들지
 * 않으며, 재료가 없으면 아예 부르지 않는다.
 */
export const RewriteSchema = z
  .object({
    /** 크리에이터가 원문 대신 읽게 될 문장. */
    rewritten: z.string().min(1).max(200),
    toneVariant: ToneVariantSchema,
    /**
     * 원문에 없는 칭찬·호감·해결책을 넣지 않았다는 모델 자신의 확인.
     *
     * 이 답을 믿어서 두는 것이 아니라, false 로 돌아오면 그 순화문을 버리기 위한
     * 그물이다. 검사 자체는 코드가 따로 한다.
     */
    addedNothing: z.boolean(),
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
/**
 * 프로필에 담을 수 있는 양.
 *
 * 이름을 붙여 둔 이유가 있다. 넘치면 `toClassificationProfile` 이 파싱에 실패하고
 * **프로필 전체가 기본값으로 돌아간다.** 채우는 쪽이 이 한계를 모르면, 표현 하나를
 * 더 넣었다가 등록해 둔 것이 통째로 사라진다. 두 곳이 같은 숫자를 보게 한다.
 */
export const PROFILE_LIMITS = {
  phraseChars: 40,
  allowedSlang: 50,
  sensitiveTopics: 30,
} as const;

export const ClassificationProfileSchema = z
  .object({
    protectionLevel: z.enum(["low", "standard", "high"]),
    allowedSlang: z
      .array(z.string().min(1).max(PROFILE_LIMITS.phraseChars))
      .max(PROFILE_LIMITS.allowedSlang),
    sensitiveTopics: z
      .array(z.string().min(1).max(PROFILE_LIMITS.phraseChars))
      .max(PROFILE_LIMITS.sensitiveTopics),
    hidePersonalAttacks: z.boolean(),
    rewriteTone: z.enum(["neutral", "friendly", "soft_disappointment"]),
    emojiFrequency: z.enum(["none", "low", "medium"]),
  })
  .strict();

export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export type Certainty = z.infer<typeof CertaintySchema>;
export type HardRiskFlag = z.infer<typeof HardRiskFlagSchema>;
export type SoftRiskFlag = z.infer<typeof SoftRiskFlagSchema>;
export type LunaFirstPass = z.infer<typeof LunaFirstPassSchema>;
export type ReasonCode = z.infer<typeof ReasonCodeSchema>;
export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;
export type FeedbackType = z.infer<typeof FeedbackTypeSchema>;
export type TerraVerdict = z.infer<typeof TerraVerdictSchema>;
export type ToneVariant = z.infer<typeof ToneVariantSchema>;
export type Rewrite = z.infer<typeof RewriteSchema>;
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
