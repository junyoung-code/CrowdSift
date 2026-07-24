import { describe, expect, it, vi } from "vitest";

import type { SourceComment } from "./comment-mapper";
import {
  createPublicImportJob,
  processPublicImportJob,
  type PublicImportRepository,
} from "./public-import-service";
import type { PublicYouTubeReadProvider } from "@/features/youtube/public-read-contracts";

const VIDEO_ID = "dQw4w9WgXcQ";
const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

const sourceComment = (
  youtubeCommentId: string,
  parentYoutubeCommentId: string | null = null,
): SourceComment => ({
  youtubeCommentId,
  parentYoutubeCommentId,
  authorChannelId: null,
  authorDisplayName: null,
  authorAvatarUrl: null,
  textDisplay: youtubeCommentId,
  textOriginal: youtubeCommentId,
  likeCount: 0,
  sourceModerationStatus: "published",
  rawPayload: { id: youtubeCommentId },
  publishedAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
});

const baseRepository = (): PublicImportRepository => ({
  upsertVideo: vi.fn(async () => undefined),
  createJob: vi.fn(async (input) => ({
    id: "public-job-1",
    workspaceId: input.workspaceId,
    youtubeVideoId: input.video.videoId,
    requestedTotalCount: input.requestedTotalCount,
    sourceVideoUrl: input.video.canonicalUrl,
    status: "pending" as const,
    fetchedCount: 0,
    storedCount: 0,
    duplicateCount: 0,
    failedCount: 0,
    topLevelCount: 0,
    replyCount: 0,
    youtubeQuotaUnitsUsed: 0,
  })),
  markRunning: vi.fn(async () => undefined),
  upsertSource: vi.fn(async ({ comment }) => ({
    disposition: "stored" as const,
    rawCommentId: `raw-${comment.youtubeCommentId}`,
  })),
  recordFailedItem: vi.fn(async () => undefined),
  completeJob: vi.fn(async () => undefined),
  ensureAnalysisJob: vi.fn(async () => "analysis-job-1"),
});

const previewProvider = (): PublicYouTubeReadProvider => ({
  getPublicVideo: vi.fn(async () => ({
    videoId: VIDEO_ID,
    canonicalUrl: VIDEO_URL,
    title: "Public test video",
    channelId: "public-channel",
    channelTitle: "Creator",
    thumbnailUrl: null,
    commentsAvailable: true,
    commentCount: 120,
    quotaUnitsUsed: 1,
  })),
  listCommentThreads: vi.fn(),
  listReplies: vi.fn(),
});

describe("createPublicImportJob", () => {
  it("revalidates the public video and creates a pending source-labelled job", async () => {
    const provider = previewProvider();
    const repository = baseRepository();

    const job = await createPublicImportJob(
      {
        workspaceId: "workspace-1",
        url: VIDEO_URL,
        requestedTotalCount: undefined,
      },
      { provider, repository },
    );

    expect(provider.getPublicVideo).toHaveBeenCalledWith(VIDEO_ID);
    expect(repository.upsertVideo).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      video: expect.objectContaining({
        videoId: VIDEO_ID,
        channelId: "public-channel",
      }),
    });
    expect(repository.createJob).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      video: expect.objectContaining({ canonicalUrl: VIDEO_URL }),
      requestedTotalCount: 20,
    });
    expect(job).toMatchObject({
      id: "public-job-1",
      requestedTotalCount: 20,
    });
  });

  it("does not create a job when comments are unavailable", async () => {
    const provider = previewProvider();
    vi.mocked(provider.getPublicVideo).mockResolvedValue({
      ...(await provider.getPublicVideo(VIDEO_ID)),
      commentsAvailable: false,
    });
    const repository = baseRepository();

    await expect(
      createPublicImportJob(
        {
          workspaceId: "workspace-1",
          url: VIDEO_URL,
          requestedTotalCount: 20,
        },
        { provider, repository },
      ),
    ).rejects.toThrow("COMMENTS_DISABLED");
    expect(repository.createJob).not.toHaveBeenCalled();
  });
});

describe("processPublicImportJob", () => {
  it("stores observed comments, separates duplicates and failures, and queues analysis", async () => {
    const repository = baseRepository();
    vi.mocked(repository.upsertSource)
      .mockResolvedValueOnce({
        disposition: "stored",
        rawCommentId: "raw-parent-1",
      })
      .mockResolvedValueOnce({
        disposition: "duplicate",
        rawCommentId: "raw-reply-1",
      })
      .mockRejectedValueOnce(new Error("database unavailable"));

    const result = await processPublicImportJob(
      {
        job: {
          id: "public-job-1",
          workspaceId: "workspace-1",
          youtubeVideoId: VIDEO_ID,
          requestedTotalCount: 20,
          sourceVideoUrl: VIDEO_URL,
          status: "pending",
          fetchedCount: 0,
          storedCount: 0,
          duplicateCount: 0,
          failedCount: 0,
          topLevelCount: 0,
          replyCount: 0,
          youtubeQuotaUnitsUsed: 1,
        },
        analysisConfigurationKey: "analysis-config-1",
      },
      {
        repository,
        collectComments: vi.fn(async () => ({
          comments: [
            sourceComment("parent-1"),
            sourceComment("reply-1", "parent-1"),
            sourceComment("parent-2"),
          ],
          topLevelCount: 2,
          replyCount: 1,
          youtubeQuotaUnitsUsed: 3,
          nextPageToken: null,
        })),
      },
    );

    expect(result).toEqual({
      requested: 20,
      observed: 3,
      stored: 1,
      duplicates: 1,
      failed: 1,
      topLevelCount: 2,
      replyCount: 1,
      youtubeQuotaUnitsUsed: 4,
      analysisJobId: "analysis-job-1",
      status: "partially_succeeded",
    });
    expect(repository.recordFailedItem).toHaveBeenCalledWith({
      jobId: "public-job-1",
      workspaceId: "workspace-1",
      youtubeCommentId: "parent-2",
      errorCode: "source_store_failed",
    });
    expect(repository.ensureAnalysisJob).toHaveBeenCalledWith({
      importJobId: "public-job-1",
      workspaceId: "workspace-1",
      configurationKey: "analysis-config-1",
      rawCommentIds: ["raw-parent-1", "raw-reply-1"],
    });
    expect(repository.completeJob).toHaveBeenCalledWith(
      "public-job-1",
      expect.objectContaining({
        observed: 3,
        youtubeQuotaUnitsUsed: 4,
        status: "partially_succeeded",
      }),
    );
  });

  it("returns persisted terminal progress without calling YouTube or OpenAI again", async () => {
    const repository = baseRepository();
    const collectComments = vi.fn();

    const result = await processPublicImportJob(
      {
        job: {
          id: "public-job-1",
          workspaceId: "workspace-1",
          youtubeVideoId: VIDEO_ID,
          requestedTotalCount: 20,
          sourceVideoUrl: VIDEO_URL,
          status: "succeeded",
          fetchedCount: 20,
          storedCount: 18,
          duplicateCount: 2,
          failedCount: 0,
          topLevelCount: 12,
          replyCount: 8,
          youtubeQuotaUnitsUsed: 3,
        },
        analysisConfigurationKey: "analysis-config-1",
      },
      { repository, collectComments },
    );

    expect(result).toMatchObject({
      requested: 20,
      observed: 20,
      stored: 18,
      duplicates: 2,
      failed: 0,
      topLevelCount: 12,
      replyCount: 8,
      youtubeQuotaUnitsUsed: 3,
      status: "succeeded",
    });
    expect(collectComments).not.toHaveBeenCalled();
    expect(repository.markRunning).not.toHaveBeenCalled();
    expect(repository.ensureAnalysisJob).not.toHaveBeenCalled();
  });
});
