import { describe, expect, it, vi } from "vitest";

import { createSupabaseRagRepository } from "./supabase-rag-repository";

describe("Supabase creator feedback RAG repository", () => {
  it("passes an explicit workspace scope and maps RPC rows", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          feedback_id: "feedback-1",
          similarity: 0.84,
          decision: "corrected",
          corrected_category: "constructive_feedback",
          corrected_review_level: "caution",
          edited_sanitized_feedback: "자막을 더 크게 해 달라는 요청",
        },
      ],
      error: null,
    });
    const repository = createSupabaseRagRepository({ rpc });
    const vector = Array.from({ length: 1536 }, () => 0.01);

    const rows = await repository.search({
      workspaceId: "workspace-1",
      vector,
      threshold: 0.78,
      limit: 5,
    });

    expect(rpc).toHaveBeenCalledWith("match_creator_feedback", {
      target_workspace_id: "workspace-1",
      query_embedding: `[${vector.join(",")}]`,
      match_threshold: 0.78,
      match_count: 5,
    });
    expect(rows).toEqual([
      {
        workspaceId: "workspace-1",
        feedbackId: "feedback-1",
        similarity: 0.84,
        decision: "corrected",
        correctedCategory: "constructive_feedback",
        correctedReviewLevel: "caution",
        editedSanitizedFeedback: "자막을 더 크게 해 달라는 요청",
      },
    ]);
  });

  it("surfaces an RPC error instead of returning an empty result", async () => {
    const repository = createSupabaseRagRepository({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "workspace access denied" },
      }),
    });

    await expect(
      repository.search({
        workspaceId: "workspace-1",
        vector: Array.from({ length: 1536 }, () => 0),
        threshold: 0.78,
        limit: 5,
      }),
    ).rejects.toThrow("workspace access denied");
  });
});
