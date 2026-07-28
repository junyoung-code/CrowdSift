import type { ModelProvider } from "@/features/analysis/contracts";

import type { DashboardSummaryRepository } from "./dashboard-summary-service";

type SummaryInputRow = {
  workspace_id: string;
  job_status: string;
  analysis_count: number;
  safe_count: number;
  caution_count: number;
  risk_count: number;
  sanitized_signals: string[];
};

type SummaryRow = {
  id: string;
  summary_text: string;
};

type SummaryInsert = {
  workspace_id: string;
  analysis_job_id: string;
  source_analysis_count: number;
  summary_text: string;
  provider: ModelProvider;
  model_identifier: string;
  provider_response_id: string;
  prompt_version: string;
  schema_version: string;
  usage: Record<string, number>;
};

type SummaryAttemptClaim = {
  attempt_count: number;
};

export const createSupabaseDashboardSummaryRepository = ({
  claimAttempt,
  findByJobId: loadExisting,
  insert,
  loadInputs,
  updateAttempt,
}: {
  loadInputs(jobId: string): Promise<SummaryInputRow | null>;
  findByJobId(jobId: string): Promise<SummaryRow | null>;
  insert(input: SummaryInsert): Promise<SummaryRow>;
  claimAttempt(input: {
    target_workspace_id: string;
    target_analysis_job_id: string;
    target_max_attempts: number;
  }): Promise<SummaryAttemptClaim | null>;
  updateAttempt(input: {
    analysis_job_id: string;
    attempt_count: number;
    state: "failed" | "succeeded";
    error_code: string | null;
  }): Promise<void>;
}): DashboardSummaryRepository => {
  const inputsByJobId = new Map<string, Promise<SummaryInputRow | null>>();
  const getInputs = (jobId: string) => {
    const existing = inputsByJobId.get(jobId);
    if (existing) return existing;
    const pending = loadInputs(jobId);
    inputsByJobId.set(jobId, pending);
    return pending;
  };

  return {
    async getJob(jobId) {
      const row = await getInputs(jobId);
      return row
        ? { workspaceId: row.workspace_id, status: row.job_status }
        : null;
    },
    async findByJobId(jobId) {
      const row = await loadExisting(jobId);
      return row
        ? { id: row.id, summaryText: row.summary_text }
        : null;
    },
    async countFinalAnalyses(jobId) {
      return (await getInputs(jobId))?.analysis_count ?? 0;
    },
    async getSummaryInputs(jobId) {
      const row = await getInputs(jobId);
      if (!row) {
        throw new Error("Analysis job summary inputs are missing");
      }
      return {
        distribution: {
          safe: row.safe_count,
          caution: row.caution_count,
          risk: row.risk_count,
        },
        sanitizedSignals: row.sanitized_signals,
      };
    },
    async insertSummary(input) {
      const row = await insert({
        workspace_id: input.workspaceId,
        analysis_job_id: input.analysisJobId,
        source_analysis_count: input.sourceAnalysisCount,
        summary_text: input.summaryText,
        provider: input.provider,
        model_identifier: input.modelIdentifier,
        provider_response_id: input.providerResponseId,
        prompt_version: input.promptVersion,
        schema_version: input.schemaVersion,
        usage: input.usage,
      });
      return { id: row.id, summaryText: row.summary_text };
    },
    async claimAttempt(input) {
      const row = await claimAttempt({
        target_workspace_id: input.workspaceId,
        target_analysis_job_id: input.analysisJobId,
        target_max_attempts: input.maxAttempts,
      });
      return row ? { attemptCount: row.attempt_count } : null;
    },
    async markAttemptFailed(input) {
      await updateAttempt({
        analysis_job_id: input.analysisJobId,
        attempt_count: input.attemptCount,
        state: "failed",
        error_code: input.errorCode,
      });
    },
    async markSucceeded(input) {
      await updateAttempt({
        analysis_job_id: input.analysisJobId,
        attempt_count: input.attemptCount,
        state: "succeeded",
        error_code: null,
      });
    },
  };
};
