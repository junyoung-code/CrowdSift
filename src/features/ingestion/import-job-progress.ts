import type {
  PublicImportJobStatus,
} from "./public-import-service";

type SourceKind = "owned_oauth" | "public_url";

type ImportProgressInput = {
  job: {
    id: string;
    providerMode: "live" | "fixture";
    sourceKind: SourceKind;
    requestedTopLevelCount: number | null;
    requestedTotalCount: number | null;
    status: PublicImportJobStatus;
    fetchedCount: number;
    storedCount: number;
    duplicateCount: number;
    failedCount: number;
    topLevelCount: number;
    replyCount: number;
    youtubeQuotaUnitsUsed: number;
    lastErrorCode: string | null;
  };
  analysisJob: {
    id: string;
    status: PublicImportJobStatus;
    totalCount: number;
    completedCount: number;
    failedCount: number;
  } | null;
};

export type ImportJobProgress = {
  jobId: string;
  providerMode: "live" | "fixture";
  sourceKind: SourceKind;
  sourceLabel: "내 채널" | "공개 URL";
  readOnly: boolean;
  requestedCount: number;
  import: {
    status: PublicImportJobStatus;
    observedCount: number;
    storedCount: number;
    duplicateCount: number;
    failedCount: number;
    topLevelCount: number;
    replyCount: number;
    youtubeQuotaUnitsUsed: number;
    errorCode: string | null;
  };
  analysis: {
    jobId: string;
    status: PublicImportJobStatus;
    totalCount: number;
    completedCount: number;
    failedCount: number;
  } | null;
};

export function toImportJobProgress({
  analysisJob,
  job,
}: ImportProgressInput): ImportJobProgress {
  const readOnly = job.sourceKind === "public_url";
  const requestedCount = readOnly
    ? job.requestedTotalCount
    : job.requestedTopLevelCount;

  if (requestedCount === null) {
    throw new Error("Import job request count is missing");
  }

  return {
    jobId: job.id,
    providerMode: job.providerMode,
    sourceKind: job.sourceKind,
    sourceLabel: readOnly ? "공개 URL" : "내 채널",
    readOnly,
    requestedCount,
    import: {
      status: job.status,
      observedCount: job.fetchedCount,
      storedCount: job.storedCount,
      duplicateCount: job.duplicateCount,
      failedCount: job.failedCount,
      topLevelCount: job.topLevelCount,
      replyCount: job.replyCount,
      youtubeQuotaUnitsUsed: job.youtubeQuotaUnitsUsed,
      errorCode: job.lastErrorCode,
    },
    analysis: analysisJob
      ? {
          jobId: analysisJob.id,
          status: analysisJob.status,
          totalCount: analysisJob.totalCount,
          completedCount: analysisJob.completedCount,
          failedCount: analysisJob.failedCount,
        }
      : null,
  };
}
