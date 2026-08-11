import { describe, expect, it } from "vitest";

import { isTimestampOnlyComment } from "./timestamp-only-comment";

describe("isTimestampOnlyComment", () => {
  it.each([
    "3:15",
    "12:30",
    "1:02:33",
    "5:20 베란다",
    "0:00 인트로 / 2:10 베란다 / 7:45 정리",
    "0:00 - 인트로",
    "  3:15  ",
  ])("판단할 거리가 없는 것을 거른다: %s", (text) => {
    expect(isTimestampOnlyComment(text)).toBe(true);
  });

  it.each([
    "3:15 이 부분 자막 오타 났어요",
    "12:30 여기 진짜 웃겨요",
    // 실제 수집 데이터. 넉넉히 잡았을 때 목차로 걸러졌던 것이다.
    "3:15  잘생기면 쌉가능❤☺️",
    "21:56초에 뒤에는 새인가요",
    "이정도면 13:48 왁뿌볼이 이상형 아님?",
    // 목차에 가깝지만 위치가 하나뿐이라 남긴다. 거르는 쪽보다 남기는 쪽으로 기운다.
    "2:10 베란다 청소",
    "3:15 부분 다시 봐도 웃기네요 ㅋㅋ",
    "영상 3:15 쯤에 나오는 그 그릇 어디서 사셨어요?",
    "요즘 살찌셨네요",
    "ㅇㅇ",
    "",
    "   ",
    "1000",
    "3시 15분에 봤어요",
  ])("말이 붙어 있으면 남긴다: %s", (text) => {
    expect(isTimestampOnlyComment(text)).toBe(false);
  });

  it("위치 없이 시작하면 뒤에 위치가 나와도 남긴다", () => {
    // 「여기」가 먼저 나온 순간 그것은 사람이 읽을 말이다.
    expect(isTimestampOnlyComment("여기 3:15")).toBe(false);
  });

  it("폭 없는 공백이 섞여도 알아본다", () => {
    expect(isTimestampOnlyComment("​3:15")).toBe(true);
  });
});
