import { requireViewer } from "@/features/auth/require-viewer";
import { toChannelSyncProgress } from "@/features/ingestion/channel-sync-progress";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const SETTING_SELECT =
  "id, enabled, backfill_start_at, backfill_status, last_successful_sync_at, last_error_code";
const RUN_SELECT =
  "kind, status, stored_count, duplicate_count, failed_count, analyzed_count, error_code, started_at, finished_at";

export async function GET() {
  const { workspaceId } = await requireViewer();
  const admin = createAdminSupabaseClient();
  const { data: setting, error: settingError } = await admin
    .from("channel_comment_sync_settings")
    .select(SETTING_SELECT)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (settingError) {
    return Response.json(
      { error: "sync_status_unavailable" },
      { status: 500 },
    );
  }
  if (!setting) {
    return Response.json(
      toChannelSyncProgress({ setting: null, latestRun: null }),
    );
  }

  const [latestRunResult, analysisJobsResult] = await Promise.all([
    admin
      .from("channel_comment_sync_runs")
      .select(RUN_SELECT)
      .eq("workspace_id", workspaceId)
      .eq("setting_id", setting.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("analysis_jobs")
      .select("id, comment_import_jobs!inner(trigger_kind)")
      .eq("workspace_id", workspaceId)
      .eq("comment_import_jobs.trigger_kind", "channel_sync")
      .in("status", ["pending", "running"]),
  ]);

  if (latestRunResult.error || analysisJobsResult.error) {
    return Response.json(
      { error: "sync_status_unavailable" },
      { status: 500 },
    );
  }

  const analysisJobIds = (analysisJobsResult.data ?? []).map(
    (job) => job.id,
  );
  const pendingResult = analysisJobIds.length
    ? await admin
        .from("analysis_job_items")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .in("analysis_job_id", analysisJobIds)
        .eq("status", "pending")
    : { count: 0, error: null };

  if (pendingResult.error) {
    return Response.json(
      { error: "sync_status_unavailable" },
      { status: 500 },
    );
  }

  return Response.json(
    toChannelSyncProgress({
      setting,
      latestRun: latestRunResult.data,
      pendingAnalysisCount: pendingResult.count ?? 0,
    }),
  );
}
