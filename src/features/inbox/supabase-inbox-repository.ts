import type {
  CommentCategory,
  ReviewLevel,
} from "@/features/analysis/contracts";

import type {
  InboxActionState,
  InboxAnalysisState,
  InboxItem,
  InboxRepository,
} from "./inbox-query";

type InboxRpcRow = {
  raw_comment_id: string;
  source_import_job_id: string;
  source_kind: "owned_oauth" | "public_url";
  youtube_video_id: string;
  author_display_name: string | null;
  author_avatar_url: string | null;
  published_at: string | null;
  source_available: boolean;
  safe_source_text: string | null;
  analysis_id: string | null;
  category: InboxItem["category"];
  review_level: InboxItem["reviewLevel"];
  confidence: number | null;
  recommended_action: InboxItem["recommendedAction"];
  manual_review: boolean | null;
  neutral_text: string | null;
  normalized_question: string | null;
  analysis_state: string;
  action_state: InboxActionState | null;
  delete_eligible: boolean;
  total_count: number;
};

type InboxRpc = (
  name: "get_inbox_page",
  input: {
    target_workspace_id: string;
    review_levels: ReviewLevel[];
    category_filter: CommentCategory | undefined;
    video_id: string | undefined;
    analysis_state_filter: InboxAnalysisState | undefined;
    action_state_filter: InboxActionState | undefined;
    search_query: string | undefined;
    min_confidence: number | undefined;
    max_confidence: number | undefined;
    page_size: number;
    page_offset: number;
  },
) => PromiseLike<{
  data: InboxRpcRow[] | null;
  error: { message?: string } | null;
}>;

export const createSupabaseInboxRepository = ({
  rpc,
}: {
  rpc: InboxRpc;
}): InboxRepository => ({
  async query(input) {
    const { data, error } = await rpc("get_inbox_page", {
      target_workspace_id: input.workspaceId,
      review_levels: input.reviewLevels,
      category_filter: input.category ?? undefined,
      video_id: input.videoId ?? undefined,
      analysis_state_filter: input.analysisState ?? undefined,
      action_state_filter: input.actionState ?? undefined,
      search_query: input.search ?? undefined,
      min_confidence: input.minConfidence ?? undefined,
      max_confidence: input.maxConfidence ?? undefined,
      page_size: input.limit,
      page_offset: input.offset,
    });

    if (error) {
      throw new Error(error.message ?? "Comment Inbox could not be loaded");
    }

    return {
      items: (data ?? []).map((row) => ({
        rawCommentId: row.raw_comment_id,
        sourceImportJobId: row.source_import_job_id,
        sourceKind: row.source_kind,
        youtubeVideoId: row.youtube_video_id,
        authorDisplayName: row.author_display_name,
        authorAvatarUrl: row.author_avatar_url,
        publishedAt: row.published_at,
        sourceAvailable: row.source_available,
        safeSourceText: row.safe_source_text,
        analysisId: row.analysis_id,
        category: row.category,
        reviewLevel: row.review_level,
        confidence: row.confidence,
        recommendedAction: row.recommended_action,
        manualReview: row.manual_review,
        neutralText: row.neutral_text,
        normalizedQuestion: row.normalized_question,
        analysisState: row.analysis_state as InboxAnalysisState,
        actionState: row.action_state,
        deleteEligible: row.delete_eligible,
      })),
      total: data?.[0]?.total_count ?? 0,
    };
  },
});
