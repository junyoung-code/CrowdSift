import { describe, expect, it } from "vitest";

import { inspectRewrite } from "./rewrite-guard";
import type { Rewrite } from "./schemas";

const clean: Rewrite = {
  rewritten: "자막을 조금 더 크게 해주시면 보기 편할 것 같아요!",
  toneVariant: "friendly",
  addedNothing: true,
};

const inspect = (rewrite: Partial<Rewrite>, sourceText = "자막 크기 실화냐?") =>
  inspectRewrite({ rewrite: { ...clean, ...rewrite }, sourceText });

describe("rewrite guard", () => {
  it("passes a rewrite that keeps the point and adds nothing", () => {
    expect(inspect({})).toEqual({ accepted: true, rejections: [] });
  });

  it("drops one the model admitted adding to", () => {
    // The creator would otherwise read a request nobody made.
    expect(inspect({ addedNothing: false })).toMatchObject({
      accepted: false,
      rejections: ["model_reported_addition"],
    });
  });

  it("drops an empty one", () => {
    expect(inspect({ rewritten: "   " }).rejections).toContain("empty");
  });

  describe("copying from the source", () => {
    it("drops a run carried over from the original", () => {
      const outcome = inspect(
        { rewritten: "말 너무 답답하게 한다는 의견이 있었어요." },
        "말 너무 답답하게 한다.",
      );

      expect(outcome.rejections).toContain("copied_from_source");
    });

    it("sees through respacing", () => {
      const outcome = inspect(
        { rewritten: "편집개느리네진짜 라는 의견이 있었어요." },
        "편집 개 느리네 진짜.",
      );

      expect(outcome.rejections).toContain("copied_from_source");
    });

    it("does not catch a reworded copy, which is what the prompt is for", () => {
      // 편집이 개 느리네요 keeps the sting while breaking every run of eight, so
      // this check is a backstop against wholesale copying, not a tone filter.
      const outcome = inspect(
        { rewritten: "편집이 개 느리네요." },
        "편집 개느리네 진짜.",
      );

      expect(outcome.accepted).toBe(true);
    });

    it("leaves ordinary shared words alone", () => {
      // The rewrite has to talk about the same subject as the comment, so a
      // word like 썸네일 appearing in both is the normal case.
      const outcome = inspect(
        { rewritten: "썸네일과 영상 내용이 잘 맞으면 좋을 것 같아요." },
        "썸네일 낚시 좀 그만해라.",
      );

      expect(outcome.accepted).toBe(true);
    });
  });

  describe("marks", () => {
    it("allows one per sentence", () => {
      expect(
        inspect({ rewritten: "편집 템포가 빠르면 좋겠어요! 기대할게요." })
          .accepted,
      ).toBe(true);
    });

    it("drops two in the same sentence", () => {
      expect(
        inspect({ rewritten: "조금 더 빠르면 좋을 것 같아요!! ^^" }).rejections,
      ).toContain("too_many_marks");
    });

    it("counts a trailing ellipsis as one mark, not two periods", () => {
      expect(
        inspect({ rewritten: "그 부분은 조금 아쉬웠어요.." }).accepted,
      ).toBe(true);
    });

    it("drops the strong feelings the plan rules out", () => {
      for (const rewritten of [
        "조금 아쉬웠어요 ㅠㅠ",
        "재밌게 봤어요 ㅋㅋㅋㅋ",
        "다음 영상도 기대할게요 🥰",
      ]) {
        expect(inspect({ rewritten }).rejections).toContain("disallowed_mark");
      }
    });
  });

  it("reports every reason, not just the first", () => {
    const outcome = inspect(
      { rewritten: "말 너무 답답하게 한다니 ㅠㅠ", addedNothing: false },
      "말 너무 답답하게 한다.",
    );

    expect(outcome.rejections).toEqual(
      expect.arrayContaining([
        "model_reported_addition",
        "copied_from_source",
        "disallowed_mark",
      ]),
    );
  });
});
