import type {
  DashboardSummaryOutput,
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
    provider: "openai";
    modelIdentifier: string;
    providerResponseId: string;
    promptVersion: string;
    schemaVersion: string;
    usage: Record<string, number>;
  }): Promise<StoredDashboardSummary>;
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

    return repository.insertSummary({
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
  },
});
