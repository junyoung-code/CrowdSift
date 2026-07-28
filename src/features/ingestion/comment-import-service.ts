import type { SourceComment } from "./comment-mapper";

type ImportJobStatus =
  | "pending"
  | "running"
  | "partially_succeeded"
  | "succeeded"
  | "failed";

export type ImportJobRecord = {
  id: string;
  workspaceId: string;
  youtubeVideoId: string;
  requestedTopLevelCount: number;
  nextPageToken: string | null;
  status: ImportJobStatus;
  fetchedCount: number;
  storedCount: number;
  duplicateCount: number;
  failedCount: number;
};

export type ImportSummary = {
  requested: number;
  fetched: number;
  stored: number;
  duplicates: number;
  failed: number;
  nextPageToken: string | null;
  status: ImportJobStatus;
};

export interface CommentPageSource {
  fetchPage(input: {
    youtubeVideoId: string;
    topLevelLimit: number;
    pageToken?: string;
  }): Promise<{
    comments: SourceComment[];
    nextPageToken: string | null;
  }>;
}

export interface CommentImportRepository {
  getJob(jobId: string): Promise<ImportJobRecord | null>;
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
  completeJob(jobId: string, summary: ImportSummary): Promise<void>;
  ensureAnalysisJob(input: {
    importJobId: string;
    workspaceId: string;
    configurationKey: string;
    rawCommentIds: string[];
  }): Promise<void>;
}

const isTerminal = (status: ImportJobStatus) =>
  status === "succeeded" || status === "partially_succeeded";

const storedSummary = (job: ImportJobRecord): ImportSummary => ({
  requested: job.requestedTopLevelCount,
  fetched: job.fetchedCount,
  stored: job.storedCount,
  duplicates: job.duplicateCount,
  failed: job.failedCount,
  nextPageToken: job.nextPageToken,
  status: job.status,
});

export const createCommentImportService = ({
  analysisConfigurationKey,
  repository,
  source,
}: {
  source: CommentPageSource;
  repository: CommentImportRepository;
  analysisConfigurationKey: string;
}) => ({
  async process(jobId: string): Promise<ImportSummary> {
    const job = await repository.getJob(jobId);

    if (!job) {
      throw new Error("Import job not found");
    }

    if (isTerminal(job.status)) {
      return storedSummary(job);
    }

    await repository.markRunning(jobId);
    const page = await source.fetchPage({
      youtubeVideoId: job.youtubeVideoId,
      topLevelLimit: job.requestedTopLevelCount,
      pageToken: job.nextPageToken ?? undefined,
    });
    let stored = 0;
    let duplicates = 0;
    let failed = 0;
    const rawCommentIds: string[] = [];

    for (const comment of page.comments) {
      try {
        const result = await repository.upsertSource({
          jobId,
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
        await repository.recordFailedItem({
          jobId,
          workspaceId: job.workspaceId,
          youtubeCommentId: comment.youtubeCommentId,
          errorCode: "source_store_failed",
        });
      }
    }

    const status: ImportJobStatus =
      failed === 0
        ? "succeeded"
        : stored + duplicates > 0
          ? "partially_succeeded"
          : "failed";
    const summary: ImportSummary = {
      requested: job.requestedTopLevelCount,
      fetched: page.comments.length,
      stored,
      duplicates,
      failed,
      nextPageToken: page.nextPageToken,
      status,
    };

    await repository.completeJob(jobId, summary);

    if (rawCommentIds.length > 0) {
      await repository.ensureAnalysisJob({
        importJobId: jobId,
        workspaceId: job.workspaceId,
        configurationKey: analysisConfigurationKey,
        rawCommentIds: [...new Set(rawCommentIds)],
      });
    }

    return summary;
  },
});
