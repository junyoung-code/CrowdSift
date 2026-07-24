import { describe, expect, it, vi } from "vitest";

import {
  EmbeddingSchemaError,
  createRagService,
  type CreatorFeedbackSearchRepository,
} from "./rag-service";

const vector = Array.from({ length: 1536 }, () => 0.01);

describe("creator feedback RAG", () => {
  it("normalizes text and returns at most five same-workspace examples", async () => {
    const embed = vi.fn().mockResolvedValue({
      vector,
      model: "text-embedding-3-small",
      usage: { inputTokens: 8, totalTokens: 8 },
    });
    const repository: CreatorFeedbackSearchRepository = {
      search: vi.fn().mockResolvedValue(
        Array.from({ length: 6 }, (_, index) => ({
          workspaceId: "workspace-1",
          feedbackId: `feedback-${index}`,
          similarity: 0.9 - index * 0.01,
          decision: "corrected" as const,
          correctedCategory: "constructive_feedback" as const,
          correctedReviewLevel: "caution" as const,
          editedSanitizedFeedback: `개선 요청 ${index}`,
        })),
      ),
    };
    const service = createRagService({
      embeddingProvider: { embed },
      repository,
    });

    const result = await service.retrieveCreatorExamples({
      workspaceId: "workspace-1",
      text: "첫 줄\n둘째 줄",
      threshold: 0.78,
      limit: 5,
    });

    expect(embed).toHaveBeenCalledWith("첫 줄 둘째 줄");
    expect(repository.search).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        threshold: 0.78,
        limit: 5,
      }),
    );
    expect(result).toHaveLength(5);
  });

  it("rejects a row returned from another workspace", async () => {
    const service = createRagService({
      embeddingProvider: {
        embed: vi.fn().mockResolvedValue({
          vector,
          model: "text-embedding-3-small",
          usage: { inputTokens: 2, totalTokens: 2 },
        }),
      },
      repository: {
        search: vi.fn().mockResolvedValue([
          {
            workspaceId: "workspace-2",
            feedbackId: "feedback-other",
            similarity: 0.91,
            decision: "approved",
            correctedCategory: null,
            correctedReviewLevel: null,
            editedSanitizedFeedback: null,
          },
        ]),
      },
    });

    await expect(
      service.retrieveCreatorExamples({
        workspaceId: "workspace-1",
        text: "댓글",
        threshold: 0.78,
        limit: 5,
      }),
    ).rejects.toThrow("rag_workspace_scope_mismatch");
  });

  it("rejects an embedding with the wrong dimensions", async () => {
    const service = createRagService({
      embeddingProvider: {
        embed: vi.fn().mockResolvedValue({
          vector: [0.1, 0.2],
          model: "wrong",
          usage: { inputTokens: 1, totalTokens: 1 },
        }),
      },
      repository: { search: vi.fn() },
    });

    await expect(
      service.retrieveCreatorExamples({
        workspaceId: "workspace-1",
        text: "댓글",
        threshold: 0.78,
        limit: 5,
      }),
    ).rejects.toBeInstanceOf(EmbeddingSchemaError);
  });
});
