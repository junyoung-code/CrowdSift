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
  provider: "openai";
  model_identifier: string;
  provider_response_id: string;
  prompt_version: string;
  schema_version: string;
  usage: Record<string, number>;
};

export const createSupabaseDashboardSummaryRepository = ({
  findByJobId: loadExisting,
  insert,
  loadInputs,
}: {
  loadInputs(jobId: string): Promise<SummaryInputRow | null>;
  findByJobId(jobId: string): Promise<SummaryRow | null>;
  insert(input: SummaryInsert): Promise<SummaryRow>;
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
  };
};
