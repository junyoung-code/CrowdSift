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
    .select("id, workspace_id, replacement_job_id")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError || !job) {
    return Response.json({ error: "job_not_found" }, { status: 404 });
  }
  if (job.workspace_id !== workspaceId) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: retried, error: retryError } = await admin.rpc("retry_failed_classification_items", { target_job_id: job.replacement_job_id ?? job.id });
  if (retryError) return Response.json({ error: "retry_failed" }, { status: 500 });

  revalidatePath("/app/developer-tools");
  revalidatePath("/app/inbox");
  return Response.json({ data: { retriedCount: retried ?? 0, analysisJobId: job.replacement_job_id ?? job.id } });
}
