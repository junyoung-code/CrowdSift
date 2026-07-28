type DashboardSummaryWorkerResult = {
  scanned: number;
  succeeded: number;
  failed: number;
};

export const processDashboardSummaryQueue = async ({
  createSummary,
  listRetryableJobs,
  maxJobs = 5,
  onError,
}: {
  createSummary(jobId: string): Promise<unknown>;
  listRetryableJobs(maxJobs: number): Promise<string[]>;
  maxJobs?: number;
  onError?: (error: unknown, jobId: string) => void;
}): Promise<DashboardSummaryWorkerResult> => {
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 25) {
    throw new Error("Dashboard summary worker batch must be between 1 and 25");
  }

  const jobIds = await listRetryableJobs(maxJobs);
  let succeeded = 0;
  let failed = 0;

  for (const jobId of jobIds) {
    let completed = false;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await createSummary(jobId);
        completed = true;
        break;
      } catch (error) {
        onError?.(error, jobId);
      }
    }

    if (completed) {
      succeeded += 1;
    } else {
      failed += 1;
    }
  }

  return {
    scanned: jobIds.length,
    succeeded,
    failed,
  };
};
