import type {
  CreatorFeedbackSearchRepository,
  CreatorFeedbackSearchRow,
} from "./rag-service";

type MatchCreatorFeedbackRow = {
  feedback_id: string;
  similarity: number;
  decision: string;
  corrected_category: CreatorFeedbackSearchRow["correctedCategory"];
  corrected_review_level: CreatorFeedbackSearchRow["correctedReviewLevel"];
  edited_sanitized_feedback: string | null;
};

type MatchCreatorFeedbackRpc = (
  name: "match_creator_feedback",
  input: {
    target_workspace_id: string;
    query_embedding: string;
    match_threshold: number;
    match_count: number;
  },
) => PromiseLike<{
  data: MatchCreatorFeedbackRow[] | null;
  error: { message?: string } | null;
}>;

export const createSupabaseRagRepository = ({
  rpc,
}: {
  rpc: MatchCreatorFeedbackRpc;
}): CreatorFeedbackSearchRepository => ({
  async search({ workspaceId, vector, threshold, limit }) {
    const { data, error } = await rpc("match_creator_feedback", {
      target_workspace_id: workspaceId,
      query_embedding: `[${vector.join(",")}]`,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      throw new Error(error.message ?? "Creator feedback search failed");
    }

    return (data ?? []).map((row) => ({
      workspaceId,
      feedbackId: row.feedback_id,
      similarity: row.similarity,
      decision: row.decision as CreatorFeedbackSearchRow["decision"],
      correctedCategory: row.corrected_category,
      correctedReviewLevel: row.corrected_review_level,
      editedSanitizedFeedback: row.edited_sanitized_feedback,
    }));
  },
});
