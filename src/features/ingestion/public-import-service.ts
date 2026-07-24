import type {
  PublicVideoPreview,
  PublicYouTubeReadProvider,
} from "@/features/youtube/public-read-contracts";

import type { SourceComment } from "./comment-mapper";
import {
  parsePublicImportRequest,
  type PublicImportRequest,
} from "./public-import-contract";
import type { PublicCommentCollection } from "./public-comment-collector";

export type PublicImportJobStatus =
  | "pending"
  | "running"
  | "partially_succeeded"
  | "succeeded"
  | "failed";

export type PublicImportJobRecord = {
  id: string;
  workspaceId: string;
  youtubeVideoId: string;
  requestedTotalCount: number;
  sourceVideoUrl: string;
  providerMode: "live" | "fixture";
  status: PublicImportJobStatus;
  fetchedCount: number;
  storedCount: number;
  duplicateCount: number;
  failedCount: number;
  topLevelCount: number;
  replyCount: number;
  youtubeQuotaUnitsUsed: number;
};

export type PublicImportSummary = {
  requested: number;
  observed: number;
  stored: number;
  duplicates: number;
  failed: number;
  topLevelCount: number;
  replyCount: number;
  youtubeQuotaUnitsUsed: number;
  analysisJobId: string | null;
  status: PublicImportJobStatus;
};

export interface PublicImportRepository {
  upsertVideo(input: {
    workspaceId: string;
    video: PublicVideoPreview;
  }): Promise<void>;
  createJob(input: {
    workspaceId: string;
    video: PublicVideoPreview;
    requestedTotalCount: number;
  }): Promise<PublicImportJobRecord>;
  markRunning(jobId: string): Promise<void>;
  upsertSource(input: {
    jobId: string;
    workspaceId: string;
    youtubeVideoId: string;
    comment: SourceComment;
  }): Promise<{
    disposition: "stored" | "duplicate";
    rawCommentId: string;
  }>;
  recordFailedItem(input: {
    jobId: string;
    workspaceId: string;
    youtubeCommentId: string;
    errorCode: string;
  }): Promise<void>;
  completeJob(
    jobId: string,
    summary: Omit<PublicImportSummary, "analysisJobId">,
  ): Promise<void>;
  ensureAnalysisJob(input: {
    importJobId: string;
    workspaceId: string;
    configurationKey: string;
    rawCommentIds: string[];
  }): Promise<string>;
}

const terminalSummary = (
  job: PublicImportJobRecord,
): PublicImportSummary => ({
  requested: job.requestedTotalCount,
  observed: job.fetchedCount,
  stored: job.storedCount,
  duplicates: job.duplicateCount,
  failed: job.failedCount,
  topLevelCount: job.topLevelCount,
  replyCount: job.replyCount,
  youtubeQuotaUnitsUsed: job.youtubeQuotaUnitsUsed,
  analysisJobId: null,
  status: job.status,
});

export async function createPublicImportJob(
  input: {
    workspaceId: string;
    url: unknown;
    requestedTotalCount: unknown;
  },
  dependencies: {
    provider: PublicYouTubeReadProvider;
    repository: PublicImportRepository;
  },
): Promise<PublicImportJobRecord> {
  const request: PublicImportRequest = parsePublicImportRequest(input);
  const video = await dependencies.provider.getPublicVideo(request.videoId);

  if (!video.commentsAvailable) {
    throw new Error("COMMENTS_DISABLED");
  }

  await dependencies.repository.upsertVideo({
    workspaceId: input.workspaceId,
    video,
  });

  return dependencies.repository.createJob({
    workspaceId: input.workspaceId,
    video,
    requestedTotalCount: request.requestedTotalCount,
  });
}

export async function processPublicImportJob(
  input: {
    job: PublicImportJobRecord;
    analysisConfigurationKey: string;
  },
  dependencies: {
    repository: PublicImportRepository;
    collectComments: (input: {
      videoId: string;
      requestedTotalCount: number;
    }) => Promise<PublicCommentCollection>;
  },
): Promise<PublicImportSummary> {
  const { job } = input;

  if (
    job.status === "succeeded" ||
    job.status === "partially_succeeded"
  ) {
    return terminalSummary(job);
  }

  await dependencies.repository.markRunning(job.id);
  const collection = await dependencies.collectComments({
    videoId: job.youtubeVideoId,
    requestedTotalCount: job.requestedTotalCount,
  });
  let stored = 0;
  let duplicates = 0;
  let failed = 0;
  const rawCommentIds: string[] = [];

  for (const comment of collection.comments) {
    try {
      const result = await dependencies.repository.upsertSource({
        jobId: job.id,
        workspaceId: job.workspaceId,
        youtubeVideoId: job.youtubeVideoId,
        comment,
      });
      rawCommentIds.push(result.rawCommentId);

      if (result.disposition === "stored") {
        stored += 1;
      } else {
        duplicates += 1;
      }
    } catch {
      failed += 1;
      await dependencies.repository.recordFailedItem({
        jobId: job.id,
        workspaceId: job.workspaceId,
        youtubeCommentId: comment.youtubeCommentId,
        errorCode: "source_store_failed",
      });
    }
  }

  const status: PublicImportJobStatus =
    failed === 0
      ? "succeeded"
      : stored + duplicates > 0
        ? "partially_succeeded"
        : "failed";
  const persistedSummary = {
    requested: job.requestedTotalCount,
    observed: collection.comments.length,
    stored,
    duplicates,
    failed,
    topLevelCount: collection.topLevelCount,
    replyCount: collection.replyCount,
    youtubeQuotaUnitsUsed:
      job.youtubeQuotaUnitsUsed + collection.youtubeQuotaUnitsUsed,
    status,
  } satisfies Omit<PublicImportSummary, "analysisJobId">;

  await dependencies.repository.completeJob(job.id, persistedSummary);

  const uniqueRawCommentIds = [...new Set(rawCommentIds)];
  const analysisJobId =
    uniqueRawCommentIds.length > 0
      ? await dependencies.repository.ensureAnalysisJob({
          importJobId: job.id,
          workspaceId: job.workspaceId,
          configurationKey: input.analysisConfigurationKey,
          rawCommentIds: uniqueRawCommentIds,
        })
      : null;

  return {
    ...persistedSummary,
    analysisJobId,
  };
}
