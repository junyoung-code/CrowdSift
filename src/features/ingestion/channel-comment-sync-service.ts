import type { YouTubeVideo } from "@/features/youtube/video-service";

import type {
  ChannelCommentCollectionKind,
  ChannelCommentCollectionPage,
} from "./channel-comment-page-collector";
import type { SourceComment } from "./comment-mapper";
import {
  ChannelSyncProcessingError,
  toChannelSyncProcessingError,
  type ChannelSyncErrorCode,
} from "./import-errors";

export type ChannelSyncRunKind =
  | ChannelCommentCollectionKind
  | "reply_reconciliation";

export type ChannelSyncClaim = {
  settingId: string;
  runId: string;
  claimToken: string;
  workspaceId: string;
  connectionId: string;
  youtubeChannelId: string;
  runKind: ChannelSyncRunKind;
  backfillStartAt: string;
  pageToken: string | null;
  lastSuccessfulSyncAt: string | null;
  incrementalScanStartedAt: string | null;
};

export type StoreChannelCommentInput = {
  importJobId: string;
  runId: string;
  claimToken: string;
  workspaceId: string;
  youtubeVideoId: string;
  comment: SourceComment;
};

export type CompleteChannelSyncRunInput = {
  runId: string;
  claimToken: string;
  nextPageToken: string | null;
  reachedBoundary: boolean;
  observedCount: number;
  storedCount: number;
  updatedCount: number;
  duplicateCount: number;
  failedCount: number;
  analyzedCount: number;
  quotaUnitsUsed: number;
};

export type CompleteChannelVideoImportInput = {
  importJobId: string;
  runId: string;
  claimToken: string;
  observedCount: number;
  storedCount: number;
  updatedCount: number;
  duplicateCount: number;
  failedCount: number;
  topLevelCount: number;
  replyCount: number;
  errorCode: ChannelSyncErrorCode | null;
  status: "succeeded" | "partially_succeeded" | "failed";
};

export interface ChannelSyncRepository {
  upsertVideoMetadata(input: {
    workspaceId: string;
    youtubeChannelId: string;
    video: YouTubeVideo;
  }): Promise<void>;
  createOrGetVideoImportJob(input: {
    runId: string;
    claimToken: string;
    workspaceId: string;
    youtubeVideoId: string;
    providerMode: "live" | "fixture";
  }): Promise<{ id: string }>;
  storeComment(input: StoreChannelCommentInput): Promise<{
    disposition: "stored" | "updated" | "duplicate";
    rawCommentId: string;
  }>;
  recordFailedItem(input: {
    importJobId: string;
    runId: string;
    claimToken: string;
    workspaceId: string;
    youtubeCommentId: string;
    errorCode: string;
  }): Promise<void>;
  completeVideoImportJob(input: CompleteChannelVideoImportInput): Promise<void>;
  attachRecoverableAnalysisItems(input: {
    importJobId: string;
    runId: string;
    claimToken: string;
    workspaceId: string;
    youtubeVideoId: string;
    configurationKey: string;
  }): Promise<{
    analysisJobId: string | null;
    attachedRawCommentIds: string[];
  }>;
  completeRun(input: CompleteChannelSyncRunInput): Promise<void>;
  failRun(input: {
    runId: string;
    claimToken: string;
    errorCode: ChannelSyncErrorCode;
  }): Promise<void>;
}

export interface ChannelSyncSource {
  collectPage(input: {
    youtubeChannelId: string;
    pageToken: string | null;
    boundaryAt: string;
    kind: ChannelCommentCollectionKind;
  }): Promise<ChannelCommentCollectionPage>;
  listVideosByIds(videoIds: string[]): Promise<YouTubeVideo[]>;
}

export type ChannelSyncBatchResult = {
  runId: string;
  importJobIds: string[];
  analysisJobIds: string[];
  nextPageToken: string | null;
  reachedBoundary: boolean;
  observedCount: number;
  storedCount: number;
  updatedCount: number;
  duplicateCount: number;
  failedCount: number;
  analyzedCount: number;
  quotaUnitsUsed: number;
};

type VideoCounts = {
  storedCount: number;
  updatedCount: number;
  duplicateCount: number;
  failedCount: number;
};

const emptyCounts = (): VideoCounts => ({
  storedCount: 0,
  updatedCount: 0,
  duplicateCount: 0,
  failedCount: 0,
});

const importStatus = ({
  duplicateCount,
  failedCount,
  storedCount,
  updatedCount,
}: VideoCounts): CompleteChannelVideoImportInput["status"] => {
  if (failedCount === 0) return "succeeded";
  if (storedCount + updatedCount + duplicateCount > 0) {
    return "partially_succeeded";
  }
  return "failed";
};

const importStatusWithMetadata = (
  counts: VideoCounts,
  metadataError: ChannelSyncProcessingError | null,
): CompleteChannelVideoImportInput["status"] => {
  const status = importStatus(counts);
  return metadataError && status === "succeeded"
    ? "partially_succeeded"
    : status;
};

const collectionInput = (
  claim: ChannelSyncClaim,
): { boundaryAt: string; kind: ChannelCommentCollectionKind } => {
  if (claim.runKind === "backfill_recent") {
    return { boundaryAt: claim.backfillStartAt, kind: claim.runKind };
  }
  if (claim.runKind === "incremental") {
    return {
      boundaryAt: claim.lastSuccessfulSyncAt ?? claim.backfillStartAt,
      kind: claim.runKind,
    };
  }
  throw new ChannelSyncProcessingError("unsupported_sync_kind");
};

export const createChannelCommentSyncService = ({
  analysisConfigurationKey,
  providerMode,
  repository,
  source,
}: {
  repository: ChannelSyncRepository;
  source: ChannelSyncSource;
  analysisConfigurationKey: string;
  providerMode: "live" | "fixture";
}) => ({
  async process(claim: ChannelSyncClaim): Promise<ChannelSyncBatchResult> {
    try {
      const { boundaryAt, kind } = collectionInput(claim);
      const page = await source.collectPage({
        youtubeChannelId: claim.youtubeChannelId,
        pageToken: claim.pageToken,
        boundaryAt,
        kind,
      });
      const youtubeVideoIds = [...page.groups.keys()];
      const requestedVideoIds = new Set(youtubeVideoIds);
      const metadataVideoIds = new Set<string>();
      let metadataLookupError: ChannelSyncProcessingError | null = null;
      let videos: YouTubeVideo[] = [];

      try {
        videos = await source.listVideosByIds(youtubeVideoIds);
      } catch (error) {
        metadataLookupError = toChannelSyncProcessingError(error);
      }

      for (const targetVideo of videos) {
        if (!requestedVideoIds.has(targetVideo.id)) continue;
        await repository.upsertVideoMetadata({
          workspaceId: claim.workspaceId,
          youtubeChannelId: claim.youtubeChannelId,
          video: targetVideo,
        });
        metadataVideoIds.add(targetVideo.id);
      }

      const totals = emptyCounts();
      totals.failedCount = page.invalidCount;
      const importJobIds: string[] = [];
      const analysisJobIds: string[] = [];
      let analyzedCount = 0;
      let runMetadataError = metadataLookupError;

      for (const [youtubeVideoId, comments] of page.groups) {
        const groupMetadataError =
          metadataLookupError ??
          (metadataVideoIds.has(youtubeVideoId)
            ? null
            : new ChannelSyncProcessingError("video_metadata_unavailable"));
        runMetadataError ??= groupMetadataError;
        const importJob = await repository.createOrGetVideoImportJob({
          runId: claim.runId,
          claimToken: claim.claimToken,
          workspaceId: claim.workspaceId,
          youtubeVideoId,
          providerMode,
        });
        importJobIds.push(importJob.id);
        const counts = emptyCounts();

        for (const sourceComment of comments) {
          try {
            const stored = await repository.storeComment({
              importJobId: importJob.id,
              runId: claim.runId,
              claimToken: claim.claimToken,
              workspaceId: claim.workspaceId,
              youtubeVideoId,
              comment: sourceComment,
            });
            counts[`${stored.disposition}Count`] += 1;
          } catch {
            counts.failedCount += 1;
            try {
              await repository.recordFailedItem({
                importJobId: importJob.id,
                runId: claim.runId,
                claimToken: claim.claimToken,
                workspaceId: claim.workspaceId,
                youtubeCommentId: sourceComment.youtubeCommentId,
                errorCode: "source_store_failed",
              });
            } catch {
              // The run counters retain the failure even if its detail row cannot be written.
            }
          }
        }

        await repository.completeVideoImportJob({
          importJobId: importJob.id,
          runId: claim.runId,
          claimToken: claim.claimToken,
          observedCount: comments.length,
          ...counts,
          topLevelCount: comments.filter(
            (item) => item.parentYoutubeCommentId === null,
          ).length,
          replyCount: comments.filter(
            (item) => item.parentYoutubeCommentId !== null,
          ).length,
          errorCode: groupMetadataError?.code ?? null,
          status: importStatusWithMetadata(counts, groupMetadataError),
        });

        if (!groupMetadataError) {
          const attachment =
            await repository.attachRecoverableAnalysisItems({
              importJobId: importJob.id,
              runId: claim.runId,
              claimToken: claim.claimToken,
              workspaceId: claim.workspaceId,
              youtubeVideoId,
              configurationKey: analysisConfigurationKey,
            });
          analyzedCount += attachment.attachedRawCommentIds.length;
          if (attachment.analysisJobId) {
            analysisJobIds.push(attachment.analysisJobId);
          }
        }

        totals.storedCount += counts.storedCount;
        totals.updatedCount += counts.updatedCount;
        totals.duplicateCount += counts.duplicateCount;
        totals.failedCount += counts.failedCount;
      }

      if (runMetadataError) {
        throw runMetadataError;
      }

      const completion: CompleteChannelSyncRunInput = {
        runId: claim.runId,
        claimToken: claim.claimToken,
        nextPageToken: page.nextPageToken,
        reachedBoundary: page.reachedBoundary,
        observedCount: page.observedCount,
        ...totals,
        analyzedCount,
        quotaUnitsUsed: page.quotaUnitsUsed,
      };
      await repository.completeRun(completion);

      return {
        runId: completion.runId,
        importJobIds,
        analysisJobIds,
        nextPageToken: completion.nextPageToken,
        reachedBoundary: completion.reachedBoundary,
        observedCount: completion.observedCount,
        storedCount: completion.storedCount,
        updatedCount: completion.updatedCount,
        duplicateCount: completion.duplicateCount,
        failedCount: completion.failedCount,
        analyzedCount: completion.analyzedCount,
        quotaUnitsUsed: completion.quotaUnitsUsed,
      };
    } catch (error) {
      const processingError = toChannelSyncProcessingError(error);
      await repository.failRun({
        runId: claim.runId,
        claimToken: claim.claimToken,
        errorCode: processingError.code,
      });
      throw processingError;
    }
  },
});
