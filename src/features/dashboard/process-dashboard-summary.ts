import "server-only";

import { createAnalysisProvider } from "@/features/analysis/analysis-provider";
import { assertProviderModeMatchesJob } from "@/features/providers/provider-mode";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import type { Json } from "@/types/database";

import { createDashboardSummaryService } from "./dashboard-summary-service";
import { createSupabaseDashboardSummaryRepository } from "./supabase-dashboard-summary-repository";

const isUniqueViolation = (error: { code?: string } | null) =>
  error?.code === "23505";

const toStringArray = (value: Json): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

export const createDashboardSummaryForCompletedJob = async (jobId: string) => {
  const admin = createAdminSupabaseClient();
  const environment = getServerEnv();
  const { data: analysisSource, error: analysisSourceError } = await admin
    .from("analysis_jobs")
    .select("import_job_id")
    .eq("id", jobId)
    .maybeSingle();

  if (
    analysisSourceError ||
    !analysisSource ||
    !analysisSource.import_job_id
  ) {
    throw analysisSourceError ?? new Error("Analysis job not found");
  }

  const { data: importSource, error: importSourceError } = await admin
    .from("comment_import_jobs")
    .select("provider_mode")
    .eq("id", analysisSource.import_job_id)
    .maybeSingle();

  if (importSourceError || !importSource) {
    throw importSourceError ?? new Error("Analysis import source not found");
  }

  assertProviderModeMatchesJob(
    importSource.provider_mode,
    environment.EXTERNAL_PROVIDER_MODE,
  );
  const repository = createSupabaseDashboardSummaryRepository({
    async claimAttempt(input) {
      const { data, error } = await admin
        .rpc("claim_dashboard_summary_job", input)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async loadInputs(targetJobId) {
      const { data, error } = await admin
        .rpc("get_dashboard_summary_inputs", {
          target_analysis_job_id: targetJobId,
        })
        .maybeSingle();

      if (error) throw error;
      return data
        ? {
            ...data,
            sanitized_signals: toStringArray(data.sanitized_signals),
          }
        : null;
    },
    async findByJobId(targetJobId) {
      const { data, error } = await admin
        .from("workspace_analysis_summaries")
        .select("id, summary_text")
        .eq("analysis_job_id", targetJobId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async insert(input) {
      const { data, error } = await admin
        .from("workspace_analysis_summaries")
        .insert({ ...input, usage: input.usage as Json })
        .select("id, summary_text")
        .single();

      if (!error && data) {
        return data;
      }
      if (!isUniqueViolation(error)) {
        throw error ?? new Error("Dashboard summary was not stored");
      }

      const { data: existing, error: existingError } = await admin
        .from("workspace_analysis_summaries")
        .select("id, summary_text")
        .eq("analysis_job_id", input.analysis_job_id)
        .single();
      if (existingError) throw existingError;
      return existing;
    },
    async updateAttempt(input) {
      const completedAt = new Date().toISOString();
      const { error } = await admin
        .from("workspace_analysis_summary_jobs")
        .update({
          state: input.state,
          last_error_code: input.error_code,
          finished_at: completedAt,
          updated_at: completedAt,
        })
        .eq("analysis_job_id", input.analysis_job_id)
        .eq("state", "running")
        .eq("attempt_count", input.attempt_count);
      if (error) throw error;
    },
  });

  return createDashboardSummaryService({
    provider: createAnalysisProvider(),
    repository,
  }).createForCompletedJob(jobId);
};
