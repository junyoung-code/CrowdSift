import { requireViewer } from "@/features/auth/require-viewer";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { classificationFailureLabel } from "@/features/classification/failure-label";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const { workspaceId } = await requireViewer();
  const db = createAdminSupabaseClient();
  const { data: job, error } = await db.from("comment_import_jobs").select("id,workspace_id,youtube_video_id,status,fetched_count,stored_count,duplicate_count,last_error_code") .eq("id", jobId).maybeSingle();
  if (error || !job) return Response.json({ error: "job_not_found" }, { status: 404 });
  if (job.workspace_id !== workspaceId) return Response.json({ error: "forbidden" }, { status: 403 });
  const { data: analysis, error: analysisError } = await db.from("analysis_jobs").select("id,status").eq("import_job_id", jobId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (analysisError) return Response.json({ error: "logs_unavailable" }, { status: 500 });
  const items: { id: string; raw_comment_id: string; status: string; error_code: string | null; attempt_count: number; started_at: string | null; finished_at: string | null }[] = [];
  if (analysis) for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("analysis_job_items").select("id,raw_comment_id,status,error_code,attempt_count,started_at,finished_at").eq("analysis_job_id", analysis.id).order("id").range(offset, offset + 499);
    if (error) return Response.json({ error: "logs_unavailable" }, { status: 500 });
    items.push(...data);
    if (data.length < 500) break;
  }
  // Job IDs were read from the workspace-scoped record, never taken from arbitrary filter text.
  const { data: events, error: logError } = await db.from("audit_logs").select("id,created_at,event_type,target_id,metadata")
    .eq("workspace_id", workspaceId)
    .or(`target_id.eq.${job.id},metadata->>analysisJobId.eq.${analysis?.id ?? job.id}`)
    .order("created_at", { ascending: false }).limit(100);
  if (logError) return Response.json({ error: "logs_unavailable" }, { status: 500 });
  const counts = items.reduce<Record<string, number>>((result, item) => { result[item.status] = (result[item.status] ?? 0) + 1; return result; }, {});
  return Response.json({ job, analysis, counts, items, events: (events ?? []).map(event => {
    const metadata = object(event.metadata); const error = object(metadata.error); const cause = object(error.cause);
    const code = String(cause.message ?? metadata.errorCode ?? event.event_type);
    return { ...event, at: event.created_at, stage: String(metadata.stage ?? event.event_type), message: classificationFailureLabel(code) };
  }) }, { headers: { "Cache-Control": "no-store" } });
}
