import {
  ClassificationProfileSchema,
  DEFAULT_CLASSIFICATION_PROFILE,
  type ClassificationProfile,
} from "./schemas";

export type ClassificationProfileRow = {
  protection_level: string;
  allowed_slang: string[] | null;
  sensitive_topics: string[] | null;
  hide_personal_attacks: boolean;
  rewrite_tone: string;
  emoji_frequency: string;
};

/**
 * 채널이 등록한 프로필을 판단에 넣을 수 있는 모양으로 바꾼다.
 *
 * 아직 아무것도 등록하지 않은 채널이 대부분이다. 그래서 행이 없는 것은 오류가
 * 아니라 기본값이다. 행이 있어도 스키마에 맞지 않으면 기본값으로 돌아간다.
 * 프로필이 잘못됐다고 댓글 분류를 멈추게 두지는 않는다.
 */
export const toClassificationProfile = (
  row: ClassificationProfileRow | null,
): ClassificationProfile => {
  if (!row) return DEFAULT_CLASSIFICATION_PROFILE;

  const parsed = ClassificationProfileSchema.safeParse({
    protectionLevel: row.protection_level,
    // 빈 칸을 걸러 낸다. 공백 한 칸이 프롬프트에 들어가 봐야 판단만 흐린다.
    allowedSlang: (row.allowed_slang ?? [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
    sensitiveTopics: (row.sensitive_topics ?? [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
    hidePersonalAttacks: row.hide_personal_attacks,
    rewriteTone: row.rewrite_tone,
    emojiFrequency: row.emoji_frequency,
  });

  return parsed.success ? parsed.data : DEFAULT_CLASSIFICATION_PROFILE;
};
