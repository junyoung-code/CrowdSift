import { describe, expect, it, vi } from "vitest";

import type { YouTubeVideo } from "@/features/youtube/video-service";

import type { ChannelCommentCollectionPage } from "./channel-comment-page-collector";
import type { SourceComment } from "./comment-mapper";
import { ChannelSyncProcessingError } from "./import-errors";
import {
  createChannelCommentSyncService,
  type ChannelSyncClaim,
  type ChannelSyncRepository,
  type ChannelSyncSource,
} from "./channel-comment-sync-service";

const claim: ChannelSyncClaim = {
  settingId: "setting-1",
  runId: "run-1",
  claimToken: "claim-token-1",
  workspaceId: "workspace-1",
  connectionId: "connection-1",
  youtubeChannelId: "channel-1",
  runKind: "backfill_recent",
  backfillStartAt: "2026-07-31T15:00:00.000Z",
  pageToken: "input-page",
  lastSuccessfulSyncAt: null,
  incrementalScanStartedAt: null,
};

const claimForRun = (runId: string, claimToken: string): ChannelSyncClaim => ({
  ...claim,
  runId,
  claimToken,
});

const comment = (
  youtubeCommentId: string,
  parentYoutubeCommentId: string | null = null,
): SourceComment => ({
  youtubeCommentId,
  parentYoutubeCommentId,
  textDisplay: `text-${youtubeCommentId}`,
  textOriginal: `original-${youtubeCommentId}`,
  authorChannelId: `author-${youtubeCommentId}`,
  authorDisplayName: `Author ${youtubeCommentId}`,
  authorAvatarUrl: null,
  likeCount: 0,
  sourceModerationStatus: "published",
  publishedAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
  rawPayload: { id: youtubeCommentId },
});

const video = (id: string): YouTubeVideo => ({
  id,
  title: `Real title ${id}`,
  thumbnailUrl: `https://example.com/${id}.jpg`,
  publishedAt: "2026-07-01T00:00:00.000Z",
});

const collection = (
  groups: Array<[string, SourceComment[]]>,
  overrides: Partial<ChannelCommentCollectionPage> = {},
): ChannelCommentCollectionPage => {
  const comments = groups.flatMap(([, items]) => items);
  const topLevelCount = comments.filter(
    (item) => item.parentYoutubeCommentId === null,
  ).length;

  return {
    comments,
    groups: new Map(groups),
    observedCount: comments.length,
    topLevelCount,
    replyCount: comments.length - topLevelCount,
    invalidCount: 0,
    nextPageToken: "next-page",
    reachedBoundary: false,
    quotaUnitsUsed: 4,
    ...overrides,
  };
};

const repository = (): ChannelSyncRepository => ({
  upsertVideoMetadata: vi.fn(async () => undefined),
  createOrGetVideoImportJob: vi.fn(async ({ youtubeVideoId }) => ({
    id: `job-${youtubeVideoId}`,
    state: "running" as const,
    analyzedCount: 0,
  })),
  storeComment: vi.fn(async ({ comment: sourceComment }) => ({
    disposition: "stored" as const,
    rawCommentId: `raw-${sourceComment.youtubeCommentId}`,
  })),
  recordFailedItem: vi.fn(async () => undefined),
  completeVideoImportJob: vi.fn(async () => undefined),
  attachRecoverableAnalysisItems: vi.fn(async () => ({
    analysisJobId: null,
    attachedRawCommentIds: [],
  })),
  completeRun: vi.fn(async () => undefined),
  failRun: vi.fn(async () => undefined),
});

const source = (
  page: ChannelCommentCollectionPage,
  videos: YouTubeVideo[] = [...page.groups.keys()].map(video),
): ChannelSyncSource => ({
  collectPage: vi.fn(async () => page),
  listVideosByIds: vi.fn(async () => videos),
});

const service = (
  targetRepository: ChannelSyncRepository,
  targetSource: ChannelSyncSource,
) =>
  createChannelCommentSyncService({
    repository: targetRepository,
    source: targetSource,
    analysisConfigurationKey: "classification-v1-key",
    providerMode: "live",
  });

describe("channel comment sync service", () => {
  it("creates analysis items only for first-seen comments", async () => {
    const targetRepository = repository();
    vi.mocked(targetRepository.storeComment)
      .mockResolvedValueOnce({ disposition: "stored", rawCommentId: "raw-1" })
      .mockResolvedValueOnce({
        disposition: "duplicate",
        rawCommentId: "raw-2",
      })
      .mockResolvedValueOnce({ disposition: "updated", rawCommentId: "raw-3" });
    vi.mocked(
      targetRepository.attachRecoverableAnalysisItems,
    ).mockResolvedValue({
      analysisJobId: "analysis-job-1",
      attachedRawCommentIds: ["raw-1"],
    });
    const page = collection([
      ["real-video-1", [comment("comment-1"), comment("comment-2"), comment("comment-3")]],
    ]);

    const result = await service(targetRepository, source(page)).process(claim);

    expect(targetRepository.attachRecoverableAnalysisItems).toHaveBeenCalledWith({
      importJobId: "job-real-video-1",
      runId: "run-1",
      claimToken: "claim-token-1",
      workspaceId: "workspace-1",
      youtubeVideoId: "real-video-1",
      configurationKey: "classification-v1-key",
    });
    expect(result).toMatchObject({
      storedCount: 1,
      updatedCount: 1,
      duplicateCount: 1,
      failedCount: 0,
      analyzedCount: 1,
    });
    expect(result).not.toHaveProperty("claimToken");
  });

  it("creates one import job per real video under the same sync run", async () => {
    const targetRepository = repository();
    const page = collection([
      ["real-video-1", [comment("comment-1")]],
      ["real-video-2", [comment("comment-2")]],
    ]);

    await service(targetRepository, source(page)).process(claim);

    expect(targetRepository.createOrGetVideoImportJob).toHaveBeenNthCalledWith(
      1,
      {
        runId: "run-1",
        claimToken: "claim-token-1",
        workspaceId: "workspace-1",
        youtubeVideoId: "real-video-1",
        providerMode: "live",
      },
    );
    expect(targetRepository.createOrGetVideoImportJob).toHaveBeenNthCalledWith(
      2,
      {
        runId: "run-1",
        claimToken: "claim-token-1",
        workspaceId: "workspace-1",
        youtubeVideoId: "real-video-2",
        providerMode: "live",
      },
    );
    expect(targetRepository.completeVideoImportJob).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        importJobId: "job-real-video-1",
        runId: "run-1",
        claimToken: "claim-token-1",
      }),
    );
    expect(targetRepository.storeComment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        runId: "run-1",
        claimToken: "claim-token-1",
        importJobId: "job-real-video-1",
      }),
    );
  });

  it("reuses the repository's run-and-video import job on a retry", async () => {
    const targetRepository = repository();
    vi.mocked(targetRepository.createOrGetVideoImportJob).mockResolvedValue({
      id: "stable-job-id",
      state: "running",
      analyzedCount: 0,
    });
    const page = collection([["real-video-1", [comment("comment-1")]]]);
    const targetService = service(targetRepository, source(page));

    await targetService.process(claim);
    await targetService.process(claim);

    expect(targetRepository.storeComment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ importJobId: "stable-job-id" }),
    );
    expect(targetRepository.storeComment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ importJobId: "stable-job-id" }),
    );
  });

  it("uses terminal video snapshots exactly once after a same-run reclaim", async () => {
    const targetRepository = repository();
    vi.mocked(targetRepository.createOrGetVideoImportJob)
      .mockResolvedValueOnce({
        id: "job-real-video-1",
        state: "terminal",
        status: "succeeded",
        storedCount: 1,
        updatedCount: 0,
        duplicateCount: 1,
        failedCount: 0,
        analyzedCount: 1,
        quotaUnitsUsed: 7,
      })
      .mockResolvedValueOnce({
        id: "job-real-video-2",
        state: "terminal",
        status: "partially_succeeded",
        storedCount: 0,
        updatedCount: 1,
        duplicateCount: 0,
        failedCount: 1,
        analyzedCount: 0,
        quotaUnitsUsed: 0,
      });
    const page = collection([
      ["real-video-1", [comment("comment-1"), comment("comment-2")]],
      ["real-video-2", [comment("comment-3"), comment("comment-4")]],
    ], { quotaUnitsUsed: 7 });

    const result = await service(
      targetRepository,
      source(page),
    ).process(claimForRun("run-1", "replacement-token"));

    expect(targetRepository.storeComment).not.toHaveBeenCalled();
    expect(targetRepository.attachRecoverableAnalysisItems).not.toHaveBeenCalled();
    expect(targetRepository.completeVideoImportJob).not.toHaveBeenCalled();
    expect(targetRepository.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        storedCount: 1,
        updatedCount: 1,
        duplicateCount: 1,
        failedCount: 1,
        analyzedCount: 1,
        quotaUnitsUsed: 7,
      }),
    );
    expect(result).toMatchObject({
      storedCount: 1,
      updatedCount: 1,
      duplicateCount: 1,
      failedCount: 1,
      analyzedCount: 1,
      quotaUnitsUsed: 7,
    });
  });

  it("fails the run with a stable provider-mode mismatch", async () => {
    const targetRepository = repository();
    vi.mocked(targetRepository.createOrGetVideoImportJob).mockRejectedValue(
      new ChannelSyncProcessingError("provider_mode_mismatch"),
    );

    await expect(
      service(
        targetRepository,
        source(collection([["real-video-1", [comment("comment-1")]]])),
      ).process(claim),
    ).rejects.toMatchObject({ code: "provider_mode_mismatch" });

    expect(targetRepository.failRun).toHaveBeenCalledWith({
      runId: "run-1",
      claimToken: "claim-token-1",
      errorCode: "provider_mode_mismatch",
    });
  });

  it("stores the real video ID but fails retryably without analysis when metadata is omitted", async () => {
    const targetRepository = repository();
    const page = collection([["real-video-id", [comment("comment-1")]]]);

    await expect(
      service(targetRepository, source(page, [])).process(claim),
    ).rejects.toMatchObject({ code: "video_metadata_unavailable" });

    expect(targetRepository.upsertVideoMetadata).not.toHaveBeenCalled();
    expect(targetRepository.createOrGetVideoImportJob).toHaveBeenCalledWith(
      expect.objectContaining({ youtubeVideoId: "real-video-id" }),
    );
    expect(targetRepository.storeComment).toHaveBeenCalledWith(
      expect.objectContaining({ youtubeVideoId: "real-video-id" }),
    );
    expect(targetRepository.attachRecoverableAnalysisItems).not.toHaveBeenCalled();
    expect(targetRepository.completeVideoImportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        importJobId: "job-real-video-id",
        errorCode: "video_metadata_unavailable",
        status: "partially_succeeded",
      }),
    );
    expect(targetRepository.failRun).toHaveBeenCalledWith({
      runId: "run-1",
      claimToken: "claim-token-1",
      errorCode: "video_metadata_unavailable",
    });
    expect(targetRepository.completeRun).not.toHaveBeenCalled();
  });

  it("stores source comments before failing a rejected metadata lookup", async () => {
    const targetRepository = repository();
    const page = collection([["real-video-id", [comment("comment-1")]]]);
    const targetSource = source(page);
    vi.mocked(targetSource.listVideosByIds).mockRejectedValue({
      response: {
        data: { error: { errors: [{ reason: "backendError" }] } },
        status: 500,
      },
    });

    await expect(
      service(targetRepository, targetSource).process(claim),
    ).rejects.toMatchObject({ code: "provider_error" });

    expect(targetRepository.storeComment).toHaveBeenCalledWith(
      expect.objectContaining({ youtubeVideoId: "real-video-id" }),
    );
    expect(targetRepository.attachRecoverableAnalysisItems).not.toHaveBeenCalled();
    expect(targetRepository.completeVideoImportJob).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "provider_error" }),
    );
  });

  it("recovers a prior failed run's first-seen comments into the new run after metadata becomes available", async () => {
    const targetRepository = repository();
    const page = collection([["real-video-id", [comment("comment-1")]]]);
    const targetSource = source(page, []);
    vi.mocked(targetSource.listVideosByIds)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([video("real-video-id")]);
    vi.mocked(targetRepository.storeComment)
      .mockResolvedValueOnce({ disposition: "stored", rawCommentId: "raw-1" })
      .mockResolvedValueOnce({
        disposition: "duplicate",
        rawCommentId: "raw-1",
      });
    vi.mocked(
      targetRepository.attachRecoverableAnalysisItems,
    ).mockResolvedValueOnce({
      analysisJobId: "analysis-job-1",
      attachedRawCommentIds: ["raw-1"],
    });
    vi.mocked(targetRepository.createOrGetVideoImportJob).mockImplementation(
      async ({ runId }) => ({
        id: `job-${runId}-real-video-id`,
        state: "running",
        analyzedCount: 0,
      }),
    );
    const targetService = service(targetRepository, targetSource);

    await expect(
      targetService.process(claimForRun("run-old", "claim-old")),
    ).rejects.toMatchObject({ code: "video_metadata_unavailable" });
    await expect(
      targetService.process(claimForRun("run-new", "claim-new")),
    ).resolves.toMatchObject({ analyzedCount: 1, duplicateCount: 1 });

    expect(targetRepository.attachRecoverableAnalysisItems).toHaveBeenCalledTimes(1);
    expect(targetRepository.attachRecoverableAnalysisItems).toHaveBeenCalledWith(
      expect.objectContaining({
        importJobId: "job-run-new-real-video-id",
      }),
    );
  });

  it("recovers a prior run's missing item after ensure failure without re-enqueueing its existing item", async () => {
    const targetRepository = repository();
    const page = collection([
      ["real-video-id", [comment("comment-1"), comment("comment-2")]],
    ]);
    vi.mocked(targetRepository.storeComment)
      .mockResolvedValueOnce({
        disposition: "stored",
        rawCommentId: "raw-missing",
      })
      .mockResolvedValueOnce({
        disposition: "stored",
        rawCommentId: "raw-existing",
      })
      .mockResolvedValueOnce({
        disposition: "duplicate",
        rawCommentId: "raw-missing",
      })
      .mockResolvedValueOnce({
        disposition: "updated",
        rawCommentId: "raw-existing",
      });
    vi.mocked(targetRepository.attachRecoverableAnalysisItems)
      .mockRejectedValueOnce(new Error("analysis write interrupted"))
      .mockResolvedValueOnce({
        analysisJobId: "analysis-job-1",
        attachedRawCommentIds: ["raw-missing"],
      });
    vi.mocked(targetRepository.createOrGetVideoImportJob).mockImplementation(
      async ({ runId }) => ({
        id: `job-${runId}-real-video-id`,
        state: "running",
        analyzedCount: 0,
      }),
    );
    const targetService = service(targetRepository, source(page));

    await expect(
      targetService.process(claimForRun("run-old", "claim-old")),
    ).rejects.toMatchObject({ code: "provider_error" });
    await expect(
      targetService.process(claimForRun("run-new", "claim-new")),
    ).resolves.toMatchObject({
      analyzedCount: 1,
      duplicateCount: 1,
      updatedCount: 1,
    });

    expect(targetRepository.attachRecoverableAnalysisItems).toHaveBeenCalledTimes(2);
    expect(targetRepository.attachRecoverableAnalysisItems).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        importJobId: "job-run-old-real-video-id",
      }),
    );
    expect(targetRepository.attachRecoverableAnalysisItems).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        importJobId: "job-run-new-real-video-id",
      }),
    );
  });

  it("recovers only the unanalyzed video from a partially processed failed run", async () => {
    const targetRepository = repository();
    const oldPage = collection([
      ["video-analyzed", [comment("comment-analyzed")]],
      ["video-missing-metadata", [comment("comment-missing")]],
    ]);
    const newPage = collection([
      ["video-missing-metadata", [comment("comment-missing")]],
    ]);
    const targetSource = source(oldPage);
    vi.mocked(targetSource.collectPage)
      .mockResolvedValueOnce(oldPage)
      .mockResolvedValueOnce(newPage);
    vi.mocked(targetSource.listVideosByIds)
      .mockResolvedValueOnce([video("video-analyzed")])
      .mockResolvedValueOnce([video("video-missing-metadata")]);
    vi.mocked(targetRepository.createOrGetVideoImportJob).mockImplementation(
      async ({ runId, youtubeVideoId }) => ({
        id: `job-${runId}-${youtubeVideoId}`,
        state: "running",
        analyzedCount: 0,
      }),
    );
    vi.mocked(targetRepository.storeComment)
      .mockResolvedValueOnce({
        disposition: "stored",
        rawCommentId: "raw-analyzed",
      })
      .mockResolvedValueOnce({
        disposition: "stored",
        rawCommentId: "raw-missing",
      })
      .mockResolvedValueOnce({
        disposition: "duplicate",
        rawCommentId: "raw-missing",
      });
    vi.mocked(targetRepository.attachRecoverableAnalysisItems)
      .mockResolvedValueOnce({
        analysisJobId: "analysis-old-analyzed",
        attachedRawCommentIds: ["raw-analyzed"],
      })
      .mockResolvedValueOnce({
        analysisJobId: "analysis-new-missing",
        attachedRawCommentIds: ["raw-missing"],
      });
    const targetService = service(targetRepository, targetSource);

    await expect(
      targetService.process(claimForRun("run-old", "claim-old")),
    ).rejects.toMatchObject({ code: "video_metadata_unavailable" });
    await expect(
      targetService.process(claimForRun("run-new", "claim-new")),
    ).resolves.toMatchObject({ analyzedCount: 1 });

    expect(targetRepository.attachRecoverableAnalysisItems).toHaveBeenCalledTimes(2);
    expect(targetRepository.attachRecoverableAnalysisItems).toHaveBeenNthCalledWith(1, {
      importJobId: "job-run-old-video-analyzed",
      runId: "run-old",
      claimToken: "claim-old",
      workspaceId: "workspace-1",
      youtubeVideoId: "video-analyzed",
      configurationKey: "classification-v1-key",
    });
    expect(targetRepository.attachRecoverableAnalysisItems).toHaveBeenNthCalledWith(2, {
      importJobId: "job-run-new-video-missing-metadata",
      runId: "run-new",
      claimToken: "claim-new",
      workspaceId: "workspace-1",
      youtubeVideoId: "video-missing-metadata",
      configurationKey: "classification-v1-key",
    });
  });

  it("continues storing sibling comments when one item fails", async () => {
    const targetRepository = repository();
    vi.mocked(targetRepository.storeComment)
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValueOnce({ disposition: "stored", rawCommentId: "raw-2" });
    vi.mocked(
      targetRepository.attachRecoverableAnalysisItems,
    ).mockResolvedValue({
      analysisJobId: "analysis-job-1",
      attachedRawCommentIds: ["raw-2"],
    });
    const page = collection([
      ["real-video-1", [comment("comment-1"), comment("comment-2")]],
    ]);

    const result = await service(targetRepository, source(page)).process(claim);

    expect(targetRepository.storeComment).toHaveBeenCalledTimes(2);
    expect(targetRepository.recordFailedItem).toHaveBeenCalledWith({
      importJobId: "job-real-video-1",
      runId: "run-1",
      claimToken: "claim-token-1",
      workspaceId: "workspace-1",
      youtubeCommentId: "comment-1",
      errorCode: "source_store_failed",
    });
    expect(targetRepository.attachRecoverableAnalysisItems).toHaveBeenCalledWith(
      expect.objectContaining({ youtubeVideoId: "real-video-1" }),
    );
    expect(result).toMatchObject({ failedCount: 1, storedCount: 1 });
  });

  it("counts only raw comments won by the atomic analysis attachment", async () => {
    const targetRepository = repository();
    vi.mocked(targetRepository.attachRecoverableAnalysisItems).mockResolvedValue({
      analysisJobId: "analysis-current-run",
      attachedRawCommentIds: ["raw-winner"],
    });
    const page = collection([
      ["real-video-1", [comment("comment-1"), comment("comment-2")]],
    ]);

    const result = await service(targetRepository, source(page)).process(claim);

    expect(result.analyzedCount).toBe(1);
    expect(targetRepository.attachRecoverableAnalysisItems).toHaveBeenCalledWith({
      importJobId: "job-real-video-1",
      runId: "run-1",
      claimToken: "claim-token-1",
      workspaceId: "workspace-1",
      youtubeVideoId: "real-video-1",
      configurationKey: "classification-v1-key",
    });
  });

  it("does not abandon siblings when recording the failed item also fails", async () => {
    const targetRepository = repository();
    vi.mocked(targetRepository.storeComment)
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValueOnce({ disposition: "stored", rawCommentId: "raw-2" });
    vi.mocked(targetRepository.recordFailedItem).mockRejectedValue(
      new Error("failure ledger unavailable"),
    );
    const page = collection([
      ["real-video-1", [comment("comment-1"), comment("comment-2")]],
    ]);

    const result = await service(targetRepository, source(page)).process(claim);

    expect(targetRepository.storeComment).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ failedCount: 1, storedCount: 1 });
  });

  it.each([
    ["quotaExceeded", "quota_exceeded"],
    ["rateLimitExceeded", "youtube_rate_limited"],
    ["insufficientPermissions", "permission_revoked"],
    ["backendError", "provider_error"],
  ] as const)(
    "records the stable %s provider failure on the fenced run",
    async (reason, expectedCode) => {
      const targetRepository = repository();
      const targetSource = source(collection([]));
      vi.mocked(targetSource.collectPage).mockRejectedValue({
        response: { data: { error: { errors: [{ reason }] } } },
      });

      await expect(
        service(targetRepository, targetSource).process(claim),
      ).rejects.toMatchObject({ code: expectedCode });

      expect(targetRepository.failRun).toHaveBeenCalledWith({
        runId: "run-1",
        claimToken: "claim-token-1",
        errorCode: expectedCode,
      });
      expect(targetRepository.completeRun).not.toHaveBeenCalled();
    },
  );

  it("completes the fenced run with exact page boundary, counts, and quota", async () => {
    const targetRepository = repository();
    vi.mocked(targetRepository.storeComment)
      .mockResolvedValueOnce({ disposition: "stored", rawCommentId: "raw-1" })
      .mockResolvedValueOnce({ disposition: "updated", rawCommentId: "raw-2" })
      .mockResolvedValueOnce({
        disposition: "duplicate",
        rawCommentId: "raw-3",
      })
      .mockRejectedValueOnce(new Error("write failed"));
    vi.mocked(
      targetRepository.attachRecoverableAnalysisItems,
    ).mockResolvedValue({
      analysisJobId: "analysis-job-1",
      attachedRawCommentIds: ["raw-1"],
    });
    const page = collection(
      [
        [
          "real-video-1",
          [
            comment("comment-1"),
            comment("comment-2", "comment-1"),
            comment("comment-3"),
            comment("comment-4"),
          ],
        ],
      ],
      {
        observedCount: 6,
        invalidCount: 2,
        nextPageToken: null,
        reachedBoundary: true,
        quotaUnitsUsed: 7,
      },
    );

    await service(targetRepository, source(page)).process(claim);

    expect(targetRepository.completeRun).toHaveBeenCalledWith({
      runId: "run-1",
      claimToken: "claim-token-1",
      nextPageToken: null,
      reachedBoundary: true,
      observedCount: 6,
      storedCount: 1,
      updatedCount: 1,
      duplicateCount: 1,
      failedCount: 3,
      analyzedCount: 1,
      quotaUnitsUsed: 7,
    });
  });

  it("counts provider-invalid items as failed even when every group is empty", async () => {
    const targetRepository = repository();
    const page = collection([], {
      observedCount: 3,
      invalidCount: 3,
      nextPageToken: null,
      reachedBoundary: false,
      quotaUnitsUsed: 1,
    });

    const result = await service(targetRepository, source(page)).process(claim);

    expect(result).toMatchObject({
      observedCount: 3,
      storedCount: 0,
      updatedCount: 0,
      duplicateCount: 0,
      failedCount: 3,
    });
    expect(targetRepository.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({ observedCount: 3, failedCount: 3 }),
    );
  });
});

describe("channel comment sync Supabase adapter", () => {
  it("uses a validated user for workspace claims and the global claim for cron work", async () => {
    vi.resetModules();
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const requireViewer = vi.fn(async () => ({
      userId: "user-1",
      workspaceId: "workspace-1",
    }));
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminSupabaseClient: () => ({ rpc }),
    }));
    vi.doMock("@/features/auth/require-viewer", () => ({ requireViewer }));

    const { processOneChannelSyncWork } = await import(
      "./process-channel-comment-sync"
    );

    await expect(
      processOneChannelSyncWork({ workspaceId: "workspace-1" }),
    ).resolves.toBeNull();
    await expect(processOneChannelSyncWork({})).resolves.toBeNull();

    expect(requireViewer).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "claim_channel_comment_sync_work_for_workspace",
      {
        target_workspace_id: "workspace-1",
        target_requesting_user_id: "user-1",
        target_lease_seconds: 240,
      },
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "claim_channel_comment_sync_work",
      {
        target_limit: 1,
        target_lease_seconds: 240,
      },
    );

    vi.doUnmock("server-only");
    vi.doUnmock("@/lib/supabase/admin");
    vi.doUnmock("@/features/auth/require-viewer");
  });

  it("builds the exact claim-fenced import create RPC payload", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    const adapter = await import("./process-channel-comment-sync");
    const build = Reflect.get(
      adapter,
      "buildCreateChannelSyncVideoImportRpcArgs",
    );
    const actual =
      typeof build === "function"
        ? build({
            runId: "run-1",
            claimToken: "private-claim-token",
            workspaceId: "workspace-1",
            youtubeVideoId: "real-video-1",
            providerMode: "live",
          })
        : null;

    expect(actual).toEqual({
      target_run_id: "run-1",
      target_claim_token: "private-claim-token",
      target_workspace_id: "workspace-1",
      target_youtube_video_id: "real-video-1",
      target_provider_mode: "live",
    });
    vi.doUnmock("server-only");
  });

  it("maps a terminal import RPC row to an explicit durable snapshot", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    const adapter = await import("./process-channel-comment-sync");
    const mapRow = Reflect.get(adapter, "toChannelSyncVideoImportJob");
    const actual =
      typeof mapRow === "function"
        ? mapRow({
            id: "import-job-1",
            status: "succeeded",
            is_terminal: true,
            stored_count: 2,
            updated_count: 1,
            duplicate_count: 3,
            failed_count: 0,
            analyzed_count: 2,
            quota_units_used: 7,
          })
        : null;

    expect(actual).toEqual({
      id: "import-job-1",
      state: "terminal",
      status: "succeeded",
      storedCount: 2,
      updatedCount: 1,
      duplicateCount: 3,
      failedCount: 0,
      analyzedCount: 2,
      quotaUnitsUsed: 7,
    });
    vi.doUnmock("server-only");
  });

  it("builds the exact claim-fenced source storage RPC payload", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    const adapter = await import("./process-channel-comment-sync");
    const build = Reflect.get(adapter, "buildStoreChannelSyncCommentRpcArgs");
    const actual =
      typeof build === "function"
        ? build({
            importJobId: "import-job-1",
            runId: "run-1",
            claimToken: "private-claim-token",
            workspaceId: "workspace-1",
            youtubeVideoId: "real-video-1",
            comment: comment("comment-1", "parent-1"),
          })
        : null;

    expect(actual).toEqual({
      target_import_job_id: "import-job-1",
      target_run_id: "run-1",
      target_claim_token: "private-claim-token",
      target_workspace_id: "workspace-1",
      target_youtube_video_id: "real-video-1",
      target_youtube_comment_id: "comment-1",
      target_parent_youtube_comment_id: "parent-1",
      target_author_channel_id: "author-comment-1",
      target_author_display_name: "Author comment-1",
      target_author_avatar_url: null,
      target_text_display: "text-comment-1",
      target_text_original: "original-comment-1",
      target_like_count: 0,
      target_source_moderation_status: "published",
      target_published_at: "2026-08-02T00:00:00.000Z",
      target_updated_at: "2026-08-02T00:00:00.000Z",
      target_payload: { id: "comment-1" },
    });
    vi.doUnmock("server-only");
  });

  it("builds the exact claim-fenced failed-item RPC payload", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    const adapter = await import("./process-channel-comment-sync");
    const build = Reflect.get(
      adapter,
      "buildRecordChannelSyncItemFailureRpcArgs",
    );
    const actual =
      typeof build === "function"
        ? build({
            importJobId: "import-job-1",
            runId: "run-1",
            claimToken: "private-claim-token",
            workspaceId: "workspace-1",
            youtubeCommentId: "comment-1",
            errorCode: "source_store_failed",
          })
        : null;

    expect(actual).toEqual({
      target_import_job_id: "import-job-1",
      target_run_id: "run-1",
      target_claim_token: "private-claim-token",
      target_workspace_id: "workspace-1",
      target_youtube_comment_id: "comment-1",
      target_error_code: "source_store_failed",
    });
    vi.doUnmock("server-only");
  });

  it("builds the exact fenced completion RPC payload", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    const adapter = await import("./process-channel-comment-sync");
    const build = Reflect.get(adapter, "buildCompleteChannelSyncRunRpcArgs");
    const actual =
      typeof build === "function"
        ? build({
            runId: "run-1",
            claimToken: "private-claim-token",
            nextPageToken: "next-page",
            reachedBoundary: false,
            observedCount: 8,
            storedCount: 2,
            updatedCount: 1,
            duplicateCount: 3,
            failedCount: 2,
            analyzedCount: 2,
            quotaUnitsUsed: 7,
          })
        : null;

    expect(actual).toEqual({
      target_run_id: "run-1",
      target_claim_token: "private-claim-token",
      target_next_page_token: "next-page",
      target_reached_boundary: false,
      target_observed_count: 8,
      target_stored_count: 2,
      target_updated_count: 1,
      target_duplicate_count: 3,
      target_failed_count: 2,
      target_analyzed_count: 2,
      target_quota_units_used: 7,
      target_reply_cursor: null,
    });
    vi.doUnmock("server-only");
  });

  it("builds the exact fenced per-video finalization RPC payload", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    const adapter = await import("./process-channel-comment-sync");
    const build = Reflect.get(
      adapter,
      "buildFinalizeChannelVideoImportRpcArgs",
    );
    const actual =
      typeof build === "function"
        ? build({
            importJobId: "import-job-1",
            runId: "run-1",
            claimToken: "private-claim-token",
            observedCount: 4,
            storedCount: 1,
            updatedCount: 1,
            duplicateCount: 1,
            failedCount: 1,
            topLevelCount: 3,
            replyCount: 1,
            quotaUnitsUsed: 7,
            errorCode: "provider_error",
            status: "partially_succeeded",
          })
        : null;

    expect(actual).toEqual({
      target_import_job_id: "import-job-1",
      target_run_id: "run-1",
      target_claim_token: "private-claim-token",
      target_observed_count: 4,
      target_stored_count: 1,
      target_updated_count: 1,
      target_duplicate_count: 1,
      target_failed_count: 1,
      target_top_level_count: 3,
      target_reply_count: 1,
      target_quota_units_used: 7,
      target_error_code: "provider_error",
      target_status: "partially_succeeded",
    });
    vi.doUnmock("server-only");
  });

  it("builds the exact fenced atomic analysis attachment RPC payload", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    const adapter = await import("./process-channel-comment-sync");
    const build = Reflect.get(
      adapter,
      "buildAttachChannelSyncAnalysisItemsRpcArgs",
    );
    const actual =
      typeof build === "function"
        ? build({
            importJobId: "current-import-job",
            runId: "run-new",
            claimToken: "private-claim-token",
            workspaceId: "workspace-1",
            youtubeVideoId: "real-video-1",
            configurationKey: "classification-v1-key",
          })
        : null;

    expect(actual).toEqual({
      target_import_job_id: "current-import-job",
      target_run_id: "run-new",
      target_claim_token: "private-claim-token",
      target_workspace_id: "workspace-1",
      target_youtube_video_id: "real-video-1",
      target_configuration_key: "classification-v1-key",
    });
    vi.doUnmock("server-only");
  });

  it("passes the current Moderation, Luna, and Terra identifiers into the configuration key", async () => {
    vi.resetModules();
    const createClassificationConfigurationKey = vi.fn(() => "derived-key");
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/features/classification/configuration", () => ({
      createClassificationConfigurationKey,
    }));
    const adapter = await import("./process-channel-comment-sync");
    const createKey = Reflect.get(
      adapter,
      "createChannelSyncAnalysisConfigurationKey",
    );
    const actual =
      typeof createKey === "function"
        ? createKey({
            policyVersion: 7,
            providerMode: "live",
            moderationModel: "moderation-current",
            lunaModel: "luna-current",
            terraModel: "terra-current",
          })
        : null;

    expect(actual).toBe("derived-key");
    expect(createClassificationConfigurationKey).toHaveBeenCalledWith({
      policyVersion: 7,
      providerMode: "live",
      moderationModel: "moderation-current",
      lunaModel: "luna-current",
      terraModel: "terra-current",
    });
    vi.doUnmock("server-only");
    vi.doUnmock("@/features/classification/configuration");
  });
});
