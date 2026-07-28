import type {
  DashboardSummaryOutput,
  ModelProvider,
  ModelResult,
} from "@/features/analysis/contracts";
import {
  DASHBOARD_SUMMARY_PROMPT_VERSION,
  DASHBOARD_SUMMARY_SCHEMA_VERSION,
} from "@/features/analysis/prompts";

type StoredDashboardSummary = {
  id: string;
  summaryText: string;
};

export interface DashboardSummaryRepository {
  getJob(jobId: string): Promise<{
    workspaceId: string;
    status: string;
  } | null>;
  findByJobId(jobId: string): Promise<StoredDashboardSummary | null>;
  countFinalAnalyses(jobId: string): Promise<number>;
  getSummaryInputs(jobId: string): Promise<{
    distribution: Record<"safe" | "caution" | "risk", number>;
    sanitizedSignals: string[];
  }>;
  insertSummary(input: {
    workspaceId: string;
    analysisJobId: string;
    sourceAnalysisCount: number;
    summaryText: string;
    provider: ModelProvider;
    modelIdentifier: string;
    providerResponseId: string;
    promptVersion: string;
    schemaVersion: string;
    usage: Record<string, number>;
  }): Promise<StoredDashboardSummary>;
  claimAttempt(input: {
    workspaceId: string;
    analysisJobId: string;
    maxAttempts: number;
  }): Promise<{ attemptCount: number } | null>;
  markAttemptFailed(input: {
    analysisJobId: string;
    attemptCount: number;
    errorCode: string;
  }): Promise<void>;
  markSucceeded(input: {
    analysisJobId: string;
    attemptCount: number;
  }): Promise<void>;
}

const TERMINAL_JOB_STATUSES = new Set([
  "succeeded",
  "partially_succeeded",
  "failed",
]);

export const createDashboardSummaryService = ({
  provider,
  repository,
}: {
  provider: {
    summarizeDashboard(input: {
      analysisCount: number;
      distribution: Record<"safe" | "caution" | "risk", number>;
      sanitizedSignals: string[];
    }): Promise<ModelResult<DashboardSummaryOutput>>;
  };
  repository: DashboardSummaryRepository;
}) => ({
  async createForCompletedJob(
    jobId: string,
  ): Promise<StoredDashboardSummary | null> {
    const job = await repository.getJob(jobId);
    if (!job || !TERMINAL_JOB_STATUSES.has(job.status)) {
      return null;
    }

    const existing = await repository.findByJobId(jobId);
    if (existing) {
      return existing;
    }

    const analysisCount = await repository.countFinalAnalyses(jobId);
    if (analysisCount < 10) {
      return null;
    }

    const attempt = await repository.claimAttempt({
      workspaceId: job.workspaceId,
      analysisJobId: jobId,
      maxAttempts: 3,
    });
    if (!attempt) {
      return null;
    }

    try {
      const inputs = await repository.getSummaryInputs(jobId);
      const sanitizedSignals = inputs.sanitizedSignals
        .map((signal) => signal.trim())
        .filter(Boolean)
        .slice(0, 20);
      const result = await provider.summarizeDashboard({
        analysisCount,
        distribution: inputs.distribution,
        sanitizedSignals,
      });

      const summary = await repository.insertSummary({
        workspaceId: job.workspaceId,
        analysisJobId: jobId,
        sourceAnalysisCount: analysisCount,
        summaryText: result.output.summary,
        provider: result.provider,
        modelIdentifier: result.modelIdentifier,
        providerResponseId: result.providerResponseId,
        promptVersion: DASHBOARD_SUMMARY_PROMPT_VERSION,
        schemaVersion: DASHBOARD_SUMMARY_SCHEMA_VERSION,
        usage: result.usage,
      });
      await repository.markSucceeded({
        analysisJobId: jobId,
        attemptCount: attempt.attemptCount,
      });
      return summary;
    } catch (error) {
      await repository.markAttemptFailed({
        analysisJobId: jobId,
        attemptCount: attempt.attemptCount,
        errorCode: "dashboard_summary_failed",
      });
      throw error;
    }
  },
});
