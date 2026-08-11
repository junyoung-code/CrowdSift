import { describe, expect, it } from "vitest";

import { allowExpression } from "./allow-expression";

describe("allowing an expression the creator confirmed", () => {
  it("adds the expression to an empty list", () => {
    expect(allowExpression({ current: [], expression: "개웃김" })).toEqual({
      kind: "added",
      allowedSlang: ["개웃김"],
    });
  });

  it("does not grow the list when the same word is confirmed again", () => {
    // 같은 표현이 걸린 댓글을 여러 번 만나고, 그때마다 버튼을 누르게 된다.
    expect(
      allowExpression({ current: ["개웃김", "ㅈㄴ"], expression: " 개웃김 " }),
    ).toEqual({ kind: "already_allowed" });
  });

  it("refuses an empty confirmation", () => {
    expect(allowExpression({ current: [], expression: "   " })).toEqual({
      kind: "rejected",
      reason: "empty",
    });
  });

  it("refuses an expression longer than the schema accepts", () => {
    expect(
      allowExpression({ current: [], expression: "가".repeat(41) }),
    ).toEqual({ kind: "rejected", reason: "too_long" });
  });

  it("stops at the limit instead of silently dropping the oldest", () => {
    const full = Array.from({ length: 50 }, (_, index) => `표현${index}`);
    expect(allowExpression({ current: full, expression: "새표현" })).toEqual({
      kind: "rejected",
      reason: "list_full",
    });
  });

  it("cleans blanks that a previous edit left behind", () => {
    expect(
      allowExpression({ current: ["개웃김", "  ", ""], expression: "ㅈㄴ" }),
    ).toEqual({ kind: "added", allowedSlang: ["개웃김", "ㅈㄴ"] });
  });
});
