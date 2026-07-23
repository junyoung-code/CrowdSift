"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createOpenAIAnalysisProvider } from "@/features/analysis/openai-analysis-provider";
import { requireViewer } from "@/features/auth/require-viewer";
import { parseCreatorCorrectionForm } from "@/features/feedback/feedback-contract";
import {
  saveCreatorCorrection,
  type FeedbackRepository,
} from "@/features/feedback/feedback-service";
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
  const repository: FeedbackRepository = {
    async loadOwnedContext(input) {
      const [
        { data: rawComment, error: rawError },
        { data: analysis, error: analysisError },
      ] = await Promise.all([
        admin
          .from("raw_comments")
          .select("text_display")
          .eq("workspace_id", input.workspaceId)
          .eq("id", input.rawCommentId)
          .maybeSingle(),
        admin
          .from("comment_analyses")
          .select("id")
          .eq("workspace_id", input.workspaceId)
          .eq("raw_comment_id", input.rawCommentId)
          .eq("id", input.analysisId)
          .maybeSingle(),
      ]);

      if (rawError || analysisError || !rawComment || !analysis) {
        throw rawError ?? analysisError ?? new Error("Feedback target not found");
      }

      return { sourceText: rawComment.text_display };
    },
    async insertFeedback(input) {
      const { data, error } = await admin
        .from("creator_feedback")
        .insert({
          workspace_id: input.workspaceId,
          raw_comment_id: input.rawCommentId,
          analysis_id: input.analysisId,
          actor_user_id: input.actorUserId,
          decision: input.decision,
          corrected_category: input.correctedCategory,
          corrected_review_level: input.correctedReviewLevel,
          corrected_recommended_action: input.correctedRecommendedAction,
          edited_sanitized_feedback: input.editedSanitizedFeedback,
          use_for_personalization: input.useForPersonalization,
          use_for_training: input.useForTraining,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw error ?? new Error("Creator feedback was not stored");
      }

      return data.id;
    },
    async insertEmbedding(input) {
      const { error } = await admin.from("feedback_embeddings").insert({
        workspace_id: input.workspaceId,
        creator_feedback_id: input.creatorFeedbackId,
        embedding: `[${input.vector.join(",")}]`,
        embedding_model: input.model,
      });

      if (error) {
        throw error;
      }
    },
  };

  try {
    await saveCreatorCorrection(
      {
        ...correction,
        workspaceId,
        actorUserId: userId,
      },
      {
        repository,
        embeddingProvider: createOpenAIAnalysisProvider(),
      },
    );
  } catch {
    redirect("/app/inbox?error=feedback_save_failed");
  }

  revalidatePath("/app/inbox");
  redirect("/app/inbox?feedback=saved");
};
