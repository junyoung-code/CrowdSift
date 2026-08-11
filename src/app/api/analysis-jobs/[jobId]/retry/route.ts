import { revalidatePath } from "next/cache";

import { requireViewer } from "@/features/auth/require-viewer";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const { workspaceId } = await requireViewer();
  const admin = createAdminSupabaseClient();
  const { data: job, error: jobError } = await admin
    .from("analysis_jobs")
    .select("id, workspace_id")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError || !job) {
    return Response.json({ error: "job_not_found" }, { status: 404 });
  }
  if (job.workspace_id !== workspaceId) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: retried, error: retryError } = await admin
    .from("analysis_job_items")
    .update({
      status: "pending",
      error_code: null,
      started_at: null,
      finished_at: null,
    })
    .eq("analysis_job_id", job.id)
    .eq("status", "failed")
    .select("id");

  if (retryError) {
    return Response.json({ error: "retry_failed" }, { status: 500 });
  }

  if ((retried ?? []).length > 0) {
    const { error: updateError } = await admin
      .from("analysis_jobs")
      .update({ status: "running", finished_at: null, failed_count: 0 })
      .eq("id", job.id);
    if (updateError) {
      return Response.json({ error: "retry_failed" }, { status: 500 });
    }
  }

  revalidatePath("/app/developer-tools");
  revalidatePath("/app/inbox");
  return Response.json({ data: { retriedCount: retried?.length ?? 0 } });
}
