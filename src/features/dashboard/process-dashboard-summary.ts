import "server-only";

import { createOpenAIAnalysisProvider } from "@/features/analysis/openai-analysis-provider";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
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
  const repository = createSupabaseDashboardSummaryRepository({
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
  });

  return createDashboardSummaryService({
    provider: createOpenAIAnalysisProvider(),
    repository,
  }).createForCompletedJob(jobId);
};
