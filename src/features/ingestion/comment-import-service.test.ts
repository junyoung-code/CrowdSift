import { describe, expect, it, vi } from "vitest";

import {
  createCommentImportService,
  type CommentImportRepository,
  type CommentPageSource,
} from "./comment-import-service";
import type { SourceComment } from "./comment-mapper";

const sourceComment = (youtubeCommentId: string): SourceComment => ({
  youtubeCommentId,
  parentYoutubeCommentId: null,
  authorChannelId: null,
  authorDisplayName: null,
  authorAvatarUrl: null,
  textDisplay: youtubeCommentId,
  textOriginal: null,
  likeCount: 0,
  sourceModerationStatus: "published",
  rawPayload: { id: youtubeCommentId },
  publishedAt: null,
  updatedAt: null,
});

describe("CommentImportService", () => {
  it("continues after duplicates and one item failure without rolling back success", async () => {
    const source: CommentPageSource = {
      fetchPage: vi.fn(async () => ({
        comments: [
          sourceComment("top-1"),
          sourceComment("reply-1"),
          sourceComment("reply-2"),
          sourceComment("reply-3"),
          sourceComment("top-2"),
          sourceComment("reply-4"),
        ],
        nextPageToken: "next-1",
      })),
    };
    const repository: CommentImportRepository = {
      getJob: vi.fn(async () => ({
        id: "job-1",
        workspaceId: "w1",
        youtubeVideoId: "video-1",
        requestedTopLevelCount: 20,
        nextPageToken: null,
        status: "pending",
        fetchedCount: 0,
        storedCount: 0,
        duplicateCount: 0,
        failedCount: 0,
      })),
      markRunning: vi.fn(async () => undefined),
      upsertSource: vi.fn(async ({ comment }) => {
        if (comment.youtubeCommentId === "reply-3") {
          return { disposition: "duplicate" as const, rawCommentId: "raw-4" };
        }
        if (comment.youtubeCommentId === "top-2") {
          throw new Error("database unavailable");
        }
        return {
          disposition: "stored" as const,
          rawCommentId: `raw-${comment.youtubeCommentId}`,
        };
      }),
      recordFailedItem: vi.fn(async () => undefined),
      completeJob: vi.fn(async () => undefined),
      ensureAnalysisJob: vi.fn(async () => undefined),
    };

    const service = createCommentImportService({
      source,
      repository,
      analysisConfigurationKey: "configuration-v1",
    });
    const result = await service.process("job-1");

    expect(result).toMatchObject({
      requested: 20,
      fetched: 6,
      stored: 4,
      duplicates: 1,
      failed: 1,
      nextPageToken: "next-1",
    });
    expect(repository.upsertSource).toHaveBeenCalledWith(
      expect.objectContaining({
        comment: expect.objectContaining({ youtubeCommentId: "top-1" }),
      }),
    );
    expect(repository.recordFailedItem).toHaveBeenCalledWith({
      jobId: "job-1",
      workspaceId: "w1",
      youtubeCommentId: "top-2",
      errorCode: "source_store_failed",
    });
    expect(repository.completeJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ status: "partially_succeeded" }),
    );
    expect(repository.ensureAnalysisJob).toHaveBeenCalledWith({
      importJobId: "job-1",
      workspaceId: "w1",
      configurationKey: "configuration-v1",
      rawCommentIds: expect.arrayContaining([
        "raw-top-1",
        "raw-reply-1",
        "raw-reply-2",
        "raw-4",
        "raw-reply-4",
      ]),
    });
  });

  it("returns the stored terminal summary without fetching YouTube again", async () => {
    const source: CommentPageSource = {
      fetchPage: vi.fn(),
    };
    const repository: CommentImportRepository = {
      getJob: vi.fn(async () => ({
        id: "job-1",
        workspaceId: "w1",
        youtubeVideoId: "video-1",
        requestedTopLevelCount: 20,
        nextPageToken: null,
        status: "succeeded",
        fetchedCount: 5,
        storedCount: 5,
        duplicateCount: 0,
        failedCount: 0,
      })),
      markRunning: vi.fn(),
      upsertSource: vi.fn(),
      recordFailedItem: vi.fn(),
      completeJob: vi.fn(),
      ensureAnalysisJob: vi.fn(),
    };

    const result = await createCommentImportService({
      source,
      repository,
      analysisConfigurationKey: "configuration-v1",
    }).process("job-1");

    expect(result).toMatchObject({
      requested: 20,
      fetched: 5,
      stored: 5,
      duplicates: 0,
      failed: 0,
    });
    expect(source.fetchPage).not.toHaveBeenCalled();
  });
});
