"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireViewer } from "@/features/auth/require-viewer";
import { parseCreatorCorrectionForm } from "@/features/feedback/feedback-contract";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const saveCreatorCorrectionAction = async (formData: FormData) => {
  let correction;

  try {
    correction = parseCreatorCorrectionForm(formData);
  } catch {
    redirect("/app/inbox?error=invalid_feedback");
  }

  const { userId, workspaceId } = await requireViewer();
  const admin = createAdminSupabaseClient();

  try {
    const [verdictResult, sourceItemResult] = await Promise.all([
      admin
        .from("classification_verdicts")
        .select("id")
        .eq("id", correction.analysisId)
        .eq("workspace_id", workspaceId)
        .eq("raw_comment_id", correction.rawCommentId)
        .maybeSingle(),
      admin
        .from("comment_import_items")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("import_job_id", correction.sourceImportJobId)
        .eq("raw_comment_id", correction.rawCommentId)
        .maybeSingle(),
    ]);
    if (
      verdictResult.error ||
      sourceItemResult.error ||
      !verdictResult.data ||
      !sourceItemResult.data
    ) {
      throw new Error("SOURCE_OBSERVATION_MISMATCH");
    }

    const { error } = await admin.from("classification_feedback").insert({
      workspace_id: workspaceId,
      raw_comment_id: correction.rawCommentId,
      classification_verdict_id: correction.analysisId,
      actor_user_id: userId,
      decision: correction.decision,
      corrected_level: correction.correctedReviewLevel,
      edited_feedback_core: correction.editedSanitizedFeedback,
      use_for_personalization: correction.useForPersonalization,
      use_for_training: correction.useForTraining,
    });
    if (error) throw error;
  } catch {
    redirect("/app/inbox?error=feedback_save_failed");
  }

  revalidatePath("/app/inbox");
  redirect("/app/inbox?feedback=saved");
};
