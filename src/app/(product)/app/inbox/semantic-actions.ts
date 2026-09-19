"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/features/auth/require-viewer";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { processClassificationChunk } from "@/features/classification/process-classification-job";

export async function retrySemanticRewriteAction(form: FormData) {
  const {workspaceId} = await requireViewer();
  const id=z.string().uuid().parse(form.get("verdictId"));
  const admin=createAdminSupabaseClient();
  const {error}=await admin.rpc("retry_semantic_rewrite",{target_verdict_id:id,target_workspace_id:workspaceId});
  if(error) redirect("/app/inbox?error=rewrite_retry_failed");
  const {data:verdict}=await admin.from("classification_verdicts").select("analysis_job_item_id").eq("id",id).eq("workspace_id",workspaceId).single();
  if(verdict) {
    const {data:item}=await admin.from("analysis_job_items").select("analysis_job_id").eq("id",verdict.analysis_job_item_id).eq("workspace_id",workspaceId).single();
    if(item) await processClassificationChunk(item.analysis_job_id,5);
  }
  revalidatePath("/app/inbox");
}
