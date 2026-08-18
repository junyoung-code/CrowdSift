import { revalidatePath } from "next/cache";

import { requireViewer } from "@/features/auth/require-viewer";
import {
  ImportProcessingError,
  processImportJob,
} from "@/features/ingestion/process-import-job";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const failureStatus = {
  comments_disabled: 409,
  quota_exceeded: 429,
  youtube_rate_limited: 429,
  permission_revoked: 403,
  provider_mode_mismatch: 409,
  provider_error: 502,
} as const;

export async function POST(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const { workspaceId } = await requireViewer();
  const admin = createAdminSupabaseClient();
  const { data: job, error } = await admin
    .from("comment_import_jobs")
    .select("id, workspace_id")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !job) {
    return Response.json({ error: "job_not_found" }, { status: 404 });
  }
  if (job.workspace_id !== workspaceId) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const summary = await processImportJob(job.id);
    revalidatePath("/app");
    revalidatePath("/app/inbox");
    revalidatePath("/app/developer-tools");
    return Response.json({ data: summary });
  } catch (processingError) {
    if (processingError instanceof ImportProcessingError) {
      return Response.json(
        { error: processingError.code },
        { status: failureStatus[processingError.code] },
      );
    }

    return Response.json({ error: "provider_error" }, { status: 502 });
  }
}
