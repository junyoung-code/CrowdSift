import { describe, expect, it, vi } from "vitest";

import type { YouTubeVideo } from "@/features/youtube/video-service";

import type { ChannelCommentCollectionPage } from "./channel-comment-page-collector";
import type { SourceComment } from "./comment-mapper";
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
  })),
  storeComment: vi.fn(async ({ comment: sourceComment }) => ({
    disposition: "stored" as const,
    rawCommentId: `raw-${sourceComment.youtubeCommentId}`,
  })),
  recordFailedItem: vi.fn(async () => undefined),
  completeVideoImportJob: vi.fn(async () => undefined),
  ensureAnalysisJob: vi.fn(async ({ importJobId }) => ({
    id: `analysis-${importJobId}`,
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
    const page = collection([
      ["real-video-1", [comment("comment-1"), comment("comment-2"), comment("comment-3")]],
    ]);

    const result = await service(targetRepository, source(page)).process(claim);

    expect(targetRepository.ensureAnalysisJob).toHaveBeenCalledWith({
      importJobId: "job-real-video-1",
      workspaceId: "workspace-1",
      configurationKey: "classification-v1-key",
      rawCommentIds: ["raw-1"],
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
        workspaceId: "workspace-1",
        youtubeVideoId: "real-video-1",
        providerMode: "live",
      },
    );
    expect(targetRepository.createOrGetVideoImportJob).toHaveBeenNthCalledWith(
      2,
      {
        runId: "run-1",
        workspaceId: "workspace-1",
        youtubeVideoId: "real-video-2",
        providerMode: "live",
      },
    );
  });

  it("reuses the repository's run-and-video import job on a retry", async () => {
    const targetRepository = repository();
    vi.mocked(targetRepository.createOrGetVideoImportJob).mockResolvedValue({
      id: "stable-job-id",
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

  it("preserves a real video ID without inventing metadata when lookup omits it", async () => {
    const targetRepository = repository();
    const page = collection([["real-video-id", [comment("comment-1")]]]);

    await service(targetRepository, source(page, [])).process(claim);

    expect(targetRepository.upsertVideoMetadata).not.toHaveBeenCalled();
    expect(targetRepository.createOrGetVideoImportJob).toHaveBeenCalledWith(
      expect.objectContaining({ youtubeVideoId: "real-video-id" }),
    );
    expect(targetRepository.storeComment).toHaveBeenCalledWith(
      expect.objectContaining({ youtubeVideoId: "real-video-id" }),
    );
  });

  it("continues storing sibling comments when one item fails", async () => {
    const targetRepository = repository();
    vi.mocked(targetRepository.storeComment)
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValueOnce({ disposition: "stored", rawCommentId: "raw-2" });
    const page = collection([
      ["real-video-1", [comment("comment-1"), comment("comment-2")]],
    ]);

    const result = await service(targetRepository, source(page)).process(claim);

    expect(targetRepository.storeComment).toHaveBeenCalledTimes(2);
    expect(targetRepository.recordFailedItem).toHaveBeenCalledWith({
      importJobId: "job-real-video-1",
      workspaceId: "workspace-1",
      youtubeCommentId: "comment-1",
      errorCode: "source_store_failed",
    });
    expect(targetRepository.ensureAnalysisJob).toHaveBeenCalledWith(
      expect.objectContaining({ rawCommentIds: ["raw-2"] }),
    );
    expect(result).toMatchObject({ failedCount: 1, storedCount: 1 });
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
      failedCount: 1,
      analyzedCount: 1,
      quotaUnitsUsed: 7,
    });
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
});
