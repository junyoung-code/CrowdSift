import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { processDashboardSummaryQueue } from "./dashboard-summary-worker";
import { createDashboardSummaryForCompletedJob } from "./process-dashboard-summary";

export const processRetryableDashboardSummaries = async (maxJobs = 5) => {
  const admin = createAdminSupabaseClient();

  return processDashboardSummaryQueue({
    maxJobs,
    createSummary: createDashboardSummaryForCompletedJob,
    async listRetryableJobs(targetMaxJobs) {
      const { data, error } = await admin.rpc(
        "get_retryable_dashboard_summary_jobs",
        {
          target_max_jobs: targetMaxJobs,
        },
      );
      if (error) throw error;
      return (data ?? []).map((row) => row.analysis_job_id);
    },
    onError(error, jobId) {
      console.error("Dashboard summary retry failed", { error, jobId });
    },
  });
};
