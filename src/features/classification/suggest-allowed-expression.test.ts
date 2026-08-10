import { describe, expect, it } from "vitest";

import { suggestAllowedExpressions } from "./suggest-allowed-expression";

describe("suggesting an expression to allow", () => {
  it("suggests the whole word, not the intensifier alone", () => {
    // "개" 만 풀어 주면 이 채널에서 "개" 로 시작하는 말이 전부 함께 풀린다.
    expect(suggestAllowedExpressions("ㅋㅋㅋ아 개귀여움 뱃살보고 들어옴")).toEqual([
      "개귀여움",
    ]);
  });

  it("finds the expression a real praise comment was flagged for", () => {
    expect(suggestAllowedExpressions("친구 ㅈㄴ이쁘다😊😊😊😊")).toEqual([
      "ㅈㄴ이쁘다",
    ]);
    expect(suggestAllowedExpressions("하 존나웃겨")).toEqual(["존나웃겨"]);
  });

  it("suggests nothing when the comment carries no intensifier", () => {
    // 이 댓글도 주의로 잡혔지만 풀어 줄 표현이 없다. 빈 손으로 돌려주는 편이
    // 아무 낱말이나 칭찬이라고 등록하게 두는 것보다 낫다.
    expect(suggestAllowedExpressions("아 귀엽다 귀여워 쌍지진짜")).toEqual([]);
  });

  it("does not offer to allow words used to attack someone", () => {
    expect(suggestAllowedExpressions("이 새끼 진짜 병신같네")).toEqual([]);
  });

  it("returns at most three so the person is not asked to review a list", () => {
    expect(
      suggestAllowedExpressions("개웃김 ㅈㄴ멋짐 존나좋다 ㅁㅊ 미쳤다 ㄹㅇ"),
    ).toHaveLength(3);
  });

  it("handles an empty comment", () => {
    expect(suggestAllowedExpressions("   ")).toEqual([]);
  });
});
