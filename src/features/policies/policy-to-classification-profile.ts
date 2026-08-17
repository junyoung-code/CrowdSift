import { PROFILE_LIMITS } from "@/features/classification/schemas";

import { parsePolicyPhraseLines, type PolicySensitivity } from "./policy-service";

/**
 * 운영 기준 화면에 적은 것을 분류가 읽는 프로필로 옮긴다.
 *
 * 두 저장소가 따로 있었다. 화면은 `phrase_rules`(버전 관리되는 정책)에 쓰고, 분류기는
 * `classification_profiles` 를 읽는다. 그래서 **크리에이터가 화면에서 표현을 등록해도
 * 판단에 닿지 않았다.** 개인화를 내세우는 제품에서 이것이 닿지 않으면 화면이 거짓말을
 * 하는 셈이다.
 *
 * 옮기는 것은 뜻이 정확히 맞는 셋뿐이다. 나머지는 갈 곳이 없고, 없는 자리를 지어내
 * 옮기면 사용자가 적은 것과 판단이 쓰는 것이 어긋난다.
 *
 *   허용할 표현      → allowedSlang      그대로 같은 것이다
 *   전체 민감도      → protectionLevel   값의 이름까지 같다
 *   주의해서 볼 표현  → sensitiveTopics   둘 다 「등급을 올리지 말고 한 번 더 보라」는 뜻이다
 *
 * 맥락 예외·주의/위험 추천·유해 원문 가리기는 분류가 읽는 자리가 없다. 화면에도 그렇게
 * 적어 두었다.
 */

export type ProfileUpdate = {
  protectionLevel: PolicySensitivity;
  allowedSlang: string[];
  sensitiveTopics: string[];
};

export type ProfileConversion = {
  profile: ProfileUpdate;
  /** 스키마를 넘겨 담지 못한 것. 조용히 버리지 않고 화면이 말하게 한다. */
  dropped: string[];
};

/**
 * 스키마가 받아 주는 만큼만 남긴다.
 *
 * 넘치면 `toClassificationProfile` 이 파싱에 실패하고 **프로필 전체가 기본값으로
 * 되돌아간다.** 하나를 더 넣었다가 등록해 둔 것이 통째로 사라지는 셈이라, 여기서
 * 자른다. 자른 것은 돌려주어 화면이 알린다.
 *
 * 긴 문구는 줄이지 않고 버린다. 40자에서 끊으면 뜻이 달라진 말이 등록된다.
 */
const clamp = (lines: string[], max: number) => {
  const kept: string[] = [];
  const dropped: string[] = [];

  for (const line of lines) {
    // `표현 | 설명` 으로 적었다면 앞의 표현만 가져온다. 맥락 예외와 같은 표기다.
    const phrase = line.split("|")[0]!.trim();
    if (phrase.length === 0) continue;

    if (phrase.length > PROFILE_LIMITS.phraseChars || kept.length >= max) {
      dropped.push(phrase);
      continue;
    }
    kept.push(phrase);
  }

  return { kept, dropped };
};

export const toClassificationProfileUpdate = ({
  allowed,
  blocked,
  sensitivity,
}: {
  allowed: string;
  blocked: string;
  sensitivity: PolicySensitivity;
}): ProfileConversion => {
  const slang = clamp(parsePolicyPhraseLines(allowed), PROFILE_LIMITS.allowedSlang);
  const topics = clamp(parsePolicyPhraseLines(blocked), PROFILE_LIMITS.sensitiveTopics);

  return {
    profile: {
      protectionLevel: sensitivity,
      allowedSlang: slang.kept,
      sensitiveTopics: topics.kept,
    },
    dropped: [...slang.dropped, ...topics.dropped],
  };
};
