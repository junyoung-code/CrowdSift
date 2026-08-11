import { revalidatePath } from "next/cache";

import { requireViewer } from "@/features/auth/require-viewer";
import { processClassificationChunk } from "@/features/classification/process-classification-job";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const { workspaceId } = await requireViewer();
  const admin = createAdminSupabaseClient();
  const { data: job, error } = await admin
    .from("analysis_jobs")
    .select("id, workspace_id")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !job) {
    return Response.json({ error: "job_not_found" }, { status: 404 });
  }
  if (job.workspace_id !== workspaceId) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const requestUrl = new URL(request.url);
  const requestedChunkSize = Number(
    requestUrl.searchParams.get("maxItems") ?? 5,
  );
  const maxItems =
    Number.isInteger(requestedChunkSize) &&
    requestedChunkSize >= 1 &&
    requestedChunkSize <= 5
      ? requestedChunkSize
      : 5;

  try {
    const progress = await processClassificationChunk(job.id, maxItems);
    revalidatePath("/app");
    revalidatePath("/app/inbox");
    revalidatePath("/app/comments");
    return Response.json({ data: progress });
  } catch {
    return Response.json(
      { error: "analysis_processing_failed" },
      { status: 500 },
    );
  }
}
