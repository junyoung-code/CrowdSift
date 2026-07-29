import { describe, expect, it } from "vitest";

import { containsAbuseTerm, containsSpamTerm } from "./korean-lexicon";
import { normalizeForMatching } from "./normalize-korean";

const abuse = (text: string) => containsAbuseTerm(normalizeForMatching(text));
const spam = (text: string) => containsSpamTerm(normalizeForMatching(text));

describe("containsAbuseTerm", () => {
  it.each([
    "이런 ㅆㄹㄱ 같은 걸 영상이라고 올렸냐",
    "니 수준에 뭘 해도 안 될 듯 ㅉㅉ",
    "설명을 존나 빙빙 돌리네",
    "시 발 진짜 별로다", // spacing evasion
    "시이이발 못 보겠다", // elongation evasion
  ])("flags abusive comment: %s", (text) => {
    expect(abuse(text)).toBe(true);
  });

  it.each([
    "오늘 편집 미쳤다 ㅋㅋ 완전 좋음", // 미쳤다 must not hit 미친놈
    "와 이건 진짜 개맛있겠다 존맛 ㅁㅊ", // 개/존 intensifier, must not hit
    "또 사고쳤네 ㅋㅋ 역대급이다 갓갓",
    "예시를 하나 더 넣어 주면 좋겠어요",
    "영상 잘 봤어요",
  ])("does not flag friendly/benign comment: %s", (text) => {
    expect(abuse(text)).toBe(false);
  });
});

describe("containsSpamTerm", () => {
  it.each([
    "제 채널 놀러오세요 맞구독 해드려요",
    "수익 보장 강의 신청은 프로필 링크로",
    "구매 문의는 외부 메신저로 주세요",
  ])("flags ad/spam comment: %s", (text) => {
    expect(spam(text)).toBe(true);
  });

  it.each(["영상 잘 봤어요", "다음 영상도 기대할게요"])(
    "does not flag benign comment: %s",
    (text) => {
      expect(spam(text)).toBe(false);
    },
  );
});
