import { describe, expect, it, vi } from "vitest";

import {
  saveCreatorCorrection,
  type FeedbackRepository,
} from "./feedback-service";

const correction = {
  workspaceId: "workspace-1",
  actorUserId: "user-1",
  rawCommentId: "comment-1",
  analysisId: "analysis-1",
  sourceImportJobId: "import-job-1",
  decision: "corrected" as const,
  correctedCategory: "constructive_feedback" as const,
  correctedReviewLevel: "caution" as const,
  correctedRecommendedAction: "review" as const,
  editedSanitizedFeedback: "자막을 더 크게 해 달라는 요청",
  useForPersonalization: true,
  useForTraining: false,
};

describe("creator feedback service", () => {
  it("inserts feedback without changing historical analysis or source", async () => {
    const repository: FeedbackRepository & {
      updateAnalysis: ReturnType<typeof vi.fn>;
      updateRawComment: ReturnType<typeof vi.fn>;
    } = {
      loadOwnedContext: vi.fn().mockResolvedValue({
        sourceText: "욕설이 섞였지만 자막이 작다는 댓글",
        sourceKind: "owned_oauth",
        sourceImportJobId: "import-job-1",
      }),
      insertFeedback: vi.fn().mockResolvedValue("feedback-1"),
      insertEmbedding: vi.fn(),
      updateAnalysis: vi.fn(),
      updateRawComment: vi.fn(),
    };

    await saveCreatorCorrection(correction, {
      repository,
      embeddingProvider: {
        embed: vi.fn().mockResolvedValue({
          vector: Array.from({ length: 1536 }, () => 0.01),
          model: "text-embedding-3-small",
        }),
      },
    });

    expect(repository.insertFeedback).toHaveBeenCalled();
    expect(repository.updateAnalysis).not.toHaveBeenCalled();
    expect(repository.updateRawComment).not.toHaveBeenCalled();
  });

  it("embeds only feedback with explicit personalization consent", async () => {
    const repository: FeedbackRepository = {
      loadOwnedContext: vi.fn().mockResolvedValue({
        sourceText: "원본 댓글",
        sourceKind: "owned_oauth",
        sourceImportJobId: "import-job-1",
      }),
      insertFeedback: vi.fn().mockResolvedValue("feedback-1"),
      insertEmbedding: vi.fn(),
    };
    const embed = vi.fn().mockResolvedValue({
      vector: Array.from({ length: 1536 }, () => 0.01),
      model: "text-embedding-3-small",
    });

    await saveCreatorCorrection(
      { ...correction, useForPersonalization: false, useForTraining: true },
      {
        repository,
        embeddingProvider: { embed },
      },
    );

    expect(embed).not.toHaveBeenCalled();
    expect(repository.insertEmbedding).not.toHaveBeenCalled();
    expect(repository.insertFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        useForPersonalization: false,
        useForTraining: true,
      }),
    );
  });

  it("builds a private retrieval document and stores only its vector", async () => {
    const repository: FeedbackRepository = {
      loadOwnedContext: vi.fn().mockResolvedValue({
        sourceText: "원본 댓글",
        sourceKind: "owned_oauth",
        sourceImportJobId: "import-job-1",
      }),
      insertFeedback: vi.fn().mockResolvedValue("feedback-1"),
      insertEmbedding: vi.fn(),
    };
    const embed = vi.fn().mockResolvedValue({
      vector: Array.from({ length: 1536 }, () => 0.01),
      model: "text-embedding-3-small",
    });

    await saveCreatorCorrection(correction, {
      repository,
      embeddingProvider: { embed },
    });

    expect(embed).toHaveBeenCalledWith(
      expect.stringContaining("원본 댓글"),
    );
    expect(embed).toHaveBeenCalledWith(
      expect.stringContaining("자막을 더 크게 해 달라는 요청"),
    );
    expect(repository.insertEmbedding).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      creatorFeedbackId: "feedback-1",
      vector: expect.any(Array),
      model: "text-embedding-3-small",
    });
  });

  it("does not save personalization consent when embedding output is invalid", async () => {
    const repository: FeedbackRepository = {
      loadOwnedContext: vi.fn().mockResolvedValue({
        sourceText: "원본 댓글",
        sourceKind: "owned_oauth",
        sourceImportJobId: "import-job-1",
      }),
      insertFeedback: vi.fn(),
      insertEmbedding: vi.fn(),
    };

    await expect(
      saveCreatorCorrection(correction, {
        repository,
        embeddingProvider: {
          embed: vi.fn().mockResolvedValue({
            vector: [0.01],
            model: "invalid-embedding",
          }),
        },
      }),
    ).rejects.toThrow("1536");
    expect(repository.insertFeedback).not.toHaveBeenCalled();
    expect(repository.insertEmbedding).not.toHaveBeenCalled();
  });

  it.each([
    { useForPersonalization: true, useForTraining: false },
    { useForPersonalization: false, useForTraining: true },
  ])(
    "rejects public-source opt-in before embedding or storage",
    async (consent) => {
      const repository: FeedbackRepository = {
        loadOwnedContext: vi.fn().mockResolvedValue({
          sourceText: "공개 영상 댓글",
          sourceKind: "public_url",
          sourceImportJobId: "import-job-1",
        }),
        insertFeedback: vi.fn(),
        insertEmbedding: vi.fn(),
      };
      const embed = vi.fn();

      await expect(
        saveCreatorCorrection(
          {
            ...correction,
            ...consent,
          },
          {
            repository,
            embeddingProvider: { embed },
          },
        ),
      ).rejects.toMatchObject({ code: "PUBLIC_SOURCE_READ_ONLY" });
      expect(embed).not.toHaveBeenCalled();
      expect(repository.insertFeedback).not.toHaveBeenCalled();
    },
  );

  it("allows public-source feedback when both reuse opt-ins are false", async () => {
    const repository: FeedbackRepository = {
      loadOwnedContext: vi.fn().mockResolvedValue({
        sourceText: "공개 영상 댓글",
        sourceKind: "public_url",
        sourceImportJobId: "import-job-1",
      }),
      insertFeedback: vi.fn().mockResolvedValue("feedback-public"),
      insertEmbedding: vi.fn(),
    };

    await expect(
      saveCreatorCorrection(
        {
          ...correction,
          useForPersonalization: false,
          useForTraining: false,
        },
        {
          repository,
          embeddingProvider: { embed: vi.fn() },
        },
      ),
    ).resolves.toBe("feedback-public");
  });

  it("rejects a source observation that does not match the submitted comment", async () => {
    const repository: FeedbackRepository = {
      loadOwnedContext: vi
        .fn()
        .mockRejectedValue(new Error("SOURCE_OBSERVATION_MISMATCH")),
      insertFeedback: vi.fn(),
      insertEmbedding: vi.fn(),
    };

    await expect(
      saveCreatorCorrection(correction, {
        repository,
        embeddingProvider: { embed: vi.fn() },
      }),
    ).rejects.toThrow("SOURCE_OBSERVATION_MISMATCH");
    expect(repository.insertFeedback).not.toHaveBeenCalled();
  });
});
