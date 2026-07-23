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

  try {
    await createSummary(jobId);
  } catch (error) {
    onError?.(error);
  }

  return progress;
};
