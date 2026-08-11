"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireViewer } from "@/features/auth/require-viewer";
import { allowExpression } from "@/features/classification/allow-expression";
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

/**
 * 크리에이터가 "이건 우리 채널에선 칭찬이에요" 를 확인했을 때 부른다.
 *
 * 이미 내려진 판단은 건드리지 않는다. 앞으로 오는 댓글이 쓸 재료가 하나 늘 뿐이다.
 * 지난 판단까지 소급해서 바꾸면, 크리에이터가 이미 처리한 목록이 발밑에서 흔들린다.
 */
export const allowChannelExpressionAction = async (formData: FormData) => {
  const expression = String(formData.get("expression") ?? "");

  const { userId, workspaceId } = await requireViewer();
  const admin = createAdminSupabaseClient();

  // redirect 는 예외를 던져 흐름을 끊는다. try 안에서 부르면 성공이 실패로 삼켜진다.
  let outcome: "allowed" | `error=expression_${string}`;

  try {
    const { data: profile, error: readError } = await admin
      .from("classification_profiles")
      .select("allowed_slang")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (readError) throw readError;

    const result = allowExpression({
      current: profile?.allowed_slang ?? [],
      expression,
    });

    if (result.kind === "added") {
      const { error } = await admin.from("classification_profiles").upsert(
        {
          workspace_id: workspaceId,
          allowed_slang: result.allowedSlang,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        },
        { onConflict: "workspace_id" },
      );
      if (error) throw error;
    }

    outcome =
      result.kind === "rejected" ? `error=expression_${result.reason}` : "allowed";
  } catch {
    outcome = "error=expression_save_failed";
  }

  revalidatePath("/app/inbox");
  redirect(
    outcome === "allowed" ? "/app/inbox?expression=allowed" : `/app/inbox?${outcome}`,
  );
};
