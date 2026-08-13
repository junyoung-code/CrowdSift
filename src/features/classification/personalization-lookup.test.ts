import { describe, expect, it, vi } from "vitest";

import { createPersonalizationLookup } from "./personalization-lookup";

const vector = Array.from({ length: 1536 }, () => 0.01);
const embedding = { embed: vi.fn().mockResolvedValue({ vector }) };

const row = {
  feedback_id: "feedback-1",
  similarity: 0.91,
  decision: "corrected",
  source_text: "개맛있겠다 진짜",
  corrected_review_level: "safe",
  edited_sanitized_feedback: null,
};

const lookup = (
  data: unknown[] | null,
  error: { message?: string } | null = null,
) =>
  createPersonalizationLookup({
    rpc: vi.fn().mockResolvedValue({ data, error }) as never,
    embedding,
  });

describe("personalization lookup", () => {
  it("hands back the comment that earned the level, not just the level", async () => {
    // 등급만 넘기면 모델에게 꼬리표 하나를 주는 셈이라 사례 구실을 못 한다.
    const examples = await lookup([row]).retrieve({
      workspaceId: "workspace-1",
      text: "개웃김 진짜",
    });

    expect(examples).toEqual([
      {
        text: "개맛있겠다 진짜",
        level: "safe",
        similarity: 0.91,
        note: null,
      },
    ]);
  });

  it("translates the stored level into the one the models speak", async () => {
    const examples = await lookup([
      { ...row, corrected_review_level: "risk" },
    ]).retrieve({ workspaceId: "workspace-1", text: "아무 말" });

    expect(examples[0]?.level).toBe("danger");
  });

  it("drops a match that never settled on a level", async () => {
    // 사람이 보류로 넘긴 것에는 가르쳐 줄 등급이 없다.
    const examples = await lookup([
      { ...row, corrected_review_level: null },
    ]).retrieve({ workspaceId: "workspace-1", text: "아무 말" });

    expect(examples).toEqual([]);
  });

  it("asks for at most five and never fewer than one", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await createPersonalizationLookup({
      rpc: rpc as never,
      embedding,
      limit: 99,
    }).retrieve({ workspaceId: "workspace-1", text: "아무 말" });

    expect(rpc).toHaveBeenCalledWith(
      "match_classification_feedback",
      expect.objectContaining({ match_count: 5, target_workspace_id: "workspace-1" }),
    );
  });

  it("does not spend an embedding call on an empty comment", async () => {
    const embed = vi.fn();
    const examples = await createPersonalizationLookup({
      rpc: vi.fn() as never,
      embedding: { embed },
    }).retrieve({ workspaceId: "workspace-1", text: "   " });

    expect(examples).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  it("refuses a vector the search cannot compare", async () => {
    await expect(
      createPersonalizationLookup({
        rpc: vi.fn() as never,
        embedding: { embed: vi.fn().mockResolvedValue({ vector: [0.1] }) },
      }).retrieve({ workspaceId: "workspace-1", text: "아무 말" }),
    ).rejects.toThrow("embedding_dimension_mismatch");
  });

  it("surfaces a search failure rather than pretending nothing matched", async () => {
    // 삼켜 버리면 개인화가 꺼진 것과 구분되지 않는다. 부르는 쪽이 판단한다.
    await expect(
      lookup(null, { message: "boom" }).retrieve({
        workspaceId: "workspace-1",
        text: "아무 말",
      }),
    ).rejects.toThrow("boom");
  });
});
