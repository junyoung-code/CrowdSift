import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import type { CreatorCorrection, FeedbackRepository } from "./feedback-service";

/**
 * 교정을 지금 파이프라인의 테이블에 넣는다.
 *
 * `feedback-service.ts` 는 `creator_feedback` 을 염두에 두고 쓰였지만, 그 테이블은
 * `analysis_id` 가 NOT NULL 이고 `comment_analyses` 를 가리킨다. 지금 파이프라인은
 * 거기에 아무것도 쓰지 않으므로 행을 만들 수가 없다. 규칙(공개 URL 차단, 동의한
 * 것만 임베딩)은 그대로 쓰고 **저장할 자리만** 바꾼다.
 */
export const createSupabaseFeedbackRepository = ({
  supabase,
}: {
  supabase: SupabaseClient<Database>;
}): FeedbackRepository => ({
  /**
   * 교정이 가리키는 것들이 실제로 서로 맞물리는지 확인하고, 원문과 출처를 돌려준다.
   *
   * 넷을 모두 본다. 하나라도 어긋나면 남의 댓글에 교정을 다는 셈이 된다.
   */
  async loadOwnedContext({
    analysisId,
    rawCommentId,
    sourceImportJobId,
    workspaceId,
  }) {
    const [comment, verdict, item, job] = await Promise.all([
      supabase
        .from("raw_comments")
        .select("text_display")
        .eq("id", rawCommentId)
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      supabase
        .from("classification_verdicts")
        .select("id")
        .eq("id", analysisId)
        .eq("workspace_id", workspaceId)
        .eq("raw_comment_id", rawCommentId)
        .maybeSingle(),
      // 이 표에는 `id` 가 없다. 열쇠가 (import_job_id, youtube_comment_id) 다.
      supabase
        .from("comment_import_items")
        .select("youtube_comment_id")
        .eq("workspace_id", workspaceId)
        .eq("import_job_id", sourceImportJobId)
        .eq("raw_comment_id", rawCommentId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("comment_import_jobs")
        .select("source_kind")
        .eq("id", sourceImportJobId)
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
    ]);

    // 어느 고리가 끊겼는지 말한다. 넷을 한 덩어리로 삼키면 고칠 데를 찾지 못한다.
    const broken = [
      ["comment", comment] as const,
      ["verdict", verdict] as const,
      ["import_item", item] as const,
      ["import_job", job] as const,
    ].find(([, result]) => result.error || !result.data);

    if (broken) {
      const [name, result] = broken;
      throw new Error(
        `SOURCE_OBSERVATION_MISMATCH:${name}:${result.error?.message ?? "not_found"}`,
      );
    }

    return {
      sourceText: comment.data!.text_display,
      sourceKind: job.data!.source_kind as "owned_oauth" | "public_url",
      sourceImportJobId,
    };
  },

  async insertFeedback(input: CreatorCorrection) {
    const { data, error } = await supabase
      .from("classification_feedback")
      .insert({
        workspace_id: input.workspaceId,
        raw_comment_id: input.rawCommentId,
        classification_verdict_id: input.analysisId,
        actor_user_id: input.actorUserId,
        decision: input.decision,
        corrected_level: input.correctedReviewLevel,
        corrected_category: input.correctedCategory,
        corrected_recommended_action: input.correctedRecommendedAction,
        edited_feedback_core: input.editedSanitizedFeedback,
        use_for_personalization: input.useForPersonalization,
        use_for_training: input.useForTraining,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "classification_feedback_insert_failed");
    }

    return data.id;
  },

  async insertEmbedding({ feedbackId, model, vector, workspaceId }) {
    const { error } = await supabase.from("feedback_embeddings").insert({
      workspace_id: workspaceId,
      classification_feedback_id: feedbackId,
      embedding: `[${vector.join(",")}]`,
      embedding_model: model,
    });

    if (error) {
      throw new Error(error.message);
    }
  },
});
