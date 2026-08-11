import type {
  CommentCategory,
  ReviewLevel,
} from "@/features/analysis/contracts";

import type {
  InboxActionState,
  InboxAnalysisState,
  InboxClassificationStatus,
  InboxClassificationTrace,
  InboxItem,
  InboxReply,
  InboxRepository,
} from "./inbox-query";

type InboxRpcReply = {
  rawCommentId?: unknown;
  authorDisplayName?: unknown;
  authorAvatarUrl?: unknown;
  publishedAt?: unknown;
  likeCount?: unknown;
  reviewLevel?: unknown;
  sourceAvailable?: unknown;
  safeSourceText?: unknown;
  neutralText?: unknown;
  normalizedQuestion?: unknown;
};

type InboxRpcRow = {
  raw_comment_id: string;
  source_import_job_id: string;
  source_kind: "owned_oauth" | "public_url";
  youtube_video_id: string;
  video_title: string | null;
  video_thumbnail_url: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  published_at: string | null;
  like_count: number;
  source_available: boolean;
  safe_source_text: string | null;
  analysis_id: string | null;
  classification_status?: unknown;
  classification_trace?: unknown;
  category: InboxItem["category"];
  review_level: InboxItem["reviewLevel"];
  ai_review_level?: InboxItem["aiReviewLevel"];
  confidence: number | null;
  recommended_action: InboxItem["recommendedAction"];
  manual_review: boolean | null;
  neutral_text: string | null;
  normalized_question: string | null;
  analysis_state: string;
  action_state: InboxActionState | null;
  delete_eligible: boolean;
  reply_count: number;
  replies: unknown;
  total_count: number;
};

type InboxRpc = (
  name: "get_inbox_conversation_page",
  input: {
    target_workspace_id: string;
    review_levels: ReviewLevel[];
    category_filter: CommentCategory | undefined;
    video_ids: string[] | undefined;
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

const optionalString = (value: unknown) =>
  typeof value === "string" ? value : null;

const classificationStatus = (
  value: unknown,
): InboxClassificationStatus | null =>
  value === "decided" || value === "review_queue" ? value : null;

const classificationTrace = (
  value: unknown,
): InboxClassificationTrace | null =>
  typeof value === "object" && value !== null
    ? (value as InboxClassificationTrace)
    : null;

const rpcReplies = (value: unknown): InboxRpcReply[] =>
  Array.isArray(value)
    ? value.filter(
        (reply): reply is InboxRpcReply =>
          typeof reply === "object" && reply !== null,
      )
    : [];

const mapReply = (reply: InboxRpcReply): InboxReply | null => {
  if (typeof reply.rawCommentId !== "string") {
    return null;
  }

  return {
    rawCommentId: reply.rawCommentId,
    authorDisplayName: optionalString(reply.authorDisplayName),
    authorAvatarUrl: optionalString(reply.authorAvatarUrl),
    publishedAt: optionalString(reply.publishedAt),
    likeCount:
      typeof reply.likeCount === "number" && Number.isFinite(reply.likeCount)
        ? reply.likeCount
        : 0,
    reviewLevel:
      reply.reviewLevel === "safe" ||
      reply.reviewLevel === "caution" ||
      reply.reviewLevel === "risk"
        ? reply.reviewLevel
        : null,
    sourceAvailable: reply.sourceAvailable === true,
    safeSourceText: optionalString(reply.safeSourceText),
    neutralText: optionalString(reply.neutralText),
    normalizedQuestion: optionalString(reply.normalizedQuestion),
  };
};

export const createSupabaseInboxRepository = ({
  rpc,
}: {
  rpc: InboxRpc;
}): InboxRepository => ({
  async query(input) {
    const { data, error } = await rpc("get_inbox_conversation_page", {
      target_workspace_id: input.workspaceId,
      review_levels: input.reviewLevels,
      category_filter: input.category ?? undefined,
      video_ids: input.videoIds.length > 0 ? input.videoIds : undefined,
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
        videoTitle: row.video_title,
        videoThumbnailUrl: row.video_thumbnail_url,
        authorDisplayName: row.author_display_name,
        authorAvatarUrl: row.author_avatar_url,
        publishedAt: row.published_at,
        likeCount: row.like_count,
        sourceAvailable: row.source_available,
        safeSourceText: row.safe_source_text,
        analysisId: row.analysis_id,
        classificationStatus: classificationStatus(
          row.classification_status,
        ),
        classificationTrace: classificationTrace(row.classification_trace),
        category: row.category,
        reviewLevel: row.review_level,
        aiReviewLevel: row.ai_review_level ?? null,
        confidence: row.confidence,
        recommendedAction: row.recommended_action,
        manualReview: row.manual_review,
        neutralText: row.neutral_text,
        normalizedQuestion: row.normalized_question,
        analysisState: row.analysis_state as InboxAnalysisState,
        actionState: row.action_state,
        deleteEligible: row.delete_eligible,
        replyCount: row.reply_count,
        replies: rpcReplies(row.replies)
          .map(mapReply)
          .filter((reply): reply is InboxReply => reply !== null),
      })),
      total: data?.[0]?.total_count ?? 0,
    };
  },
});
