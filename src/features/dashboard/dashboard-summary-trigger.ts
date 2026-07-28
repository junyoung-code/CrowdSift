export const triggerDashboardSummaryWhenComplete = async <
  TProgress extends { remaining: number },
>({
  createSummary,
  jobId,
  onError,
  progress,
}: {
  jobId: string;
  progress: TProgress;
  createSummary(jobId: string): Promise<unknown>;
  onError?: (error: unknown) => void;
}): Promise<TProgress> => {
  if (progress.remaining > 0) {
    return progress;
  }

  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await createSummary(jobId);
      break;
    } catch (error) {
      onError?.(error);
    }
  }

  return progress;
};
