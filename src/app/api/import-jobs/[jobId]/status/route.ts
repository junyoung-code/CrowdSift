import { requireViewer } from "@/features/auth/require-viewer";
import { toImportJobProgress } from "@/features/ingestion/import-job-progress";
import { parseProviderMode } from "@/features/providers/provider-mode";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const { workspaceId } = await requireViewer();
  const admin = createAdminSupabaseClient();
  const { data: job, error: jobError } = await admin
    .from("comment_import_jobs")
    .select(
      "id, workspace_id, provider_mode, source_kind, requested_top_level_count, requested_total_count, status, fetched_count, stored_count, duplicate_count, failed_count, top_level_count, reply_count, youtube_quota_units_used, last_error_code",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (jobError || !job) {
    return Response.json({ error: "job_not_found" }, { status: 404 });
  }
  if (job.workspace_id !== workspaceId) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: analysisJob, error: analysisError } = await admin
    .from("analysis_jobs")
    .select(
      "id, status, total_count, completed_count, failed_count",
    )
    .eq("workspace_id", workspaceId)
    .eq("import_job_id", job.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (analysisError) {
    return Response.json(
      { error: "job_progress_unavailable" },
      { status: 500 },
    );
  }

  return Response.json({
    data: toImportJobProgress({
      job: {
        id: job.id,
        providerMode: parseProviderMode(job.provider_mode),
        sourceKind: job.source_kind,
        requestedTopLevelCount: job.requested_top_level_count,
        requestedTotalCount: job.requested_total_count,
        status: job.status,
        fetchedCount: job.fetched_count,
        storedCount: job.stored_count,
        duplicateCount: job.duplicate_count,
        failedCount: job.failed_count,
        topLevelCount: job.top_level_count,
        replyCount: job.reply_count,
        youtubeQuotaUnitsUsed: job.youtube_quota_units_used,
        lastErrorCode: job.last_error_code,
      },
      analysisJob: analysisJob
        ? {
            id: analysisJob.id,
            status: analysisJob.status,
            totalCount: analysisJob.total_count,
            completedCount: analysisJob.completed_count,
            failedCount: analysisJob.failed_count,
          }
        : null,
    }),
  });
}
