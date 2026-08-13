import { describe, expect, it, vi } from "vitest";

import { createSupabaseInboxRepository } from "./supabase-inbox-repository";

describe("Supabase Inbox repository", () => {
  it("maps domain filters to the scoped Inbox RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          raw_comment_id: "comment-1",
          source_import_job_id: "import-1",
          source_kind: "owned_oauth",
          youtube_video_id: "video-1",
          author_display_name: "시청자",
          author_avatar_url: null,
          published_at: "2026-07-23T00:00:00.000Z",
          like_count: 12,
          reply_count: 1,
          video_title: "등산 필수 장비 7가지",
          video_thumbnail_url: "https://i.ytimg.com/example.jpg",
          source_available: true,
          safe_source_text: "안전 댓글 원문",
          analysis_id: "analysis-1",
          classification_status: "decided",
          classification_trace: {
            moderation: null,
            luna: null,
            branch: {
              outcome: "verify",
              reasons: ["luna_caution"],
              protection: {},
            },
            terra: null,
            final: {
              status: "decided",
              level: "caution",
              basis: "both_agreed",
              hideSource: true,
              raisedByModeration: false,
              reasonCodes: ["mockery"],
              recommendedActions: ["show_rewritten_only"],
            },
          },
          category: "question",
          review_level: "caution",
          confidence: 0.82,
          recommended_action: "review",
          manual_review: true,
          neutral_text: null,
          normalized_question: "자막을 크게 할 수 있나요?",
          analysis_state: "analyzed",
          action_state: null,
          delete_eligible: true,
          replies: [
            {
              rawCommentId: "reply-1",
              authorDisplayName: "creator_hj",
              authorAvatarUrl: null,
              publishedAt: "2026-07-28T10:10:00.000Z",
              likeCount: 5,
              reviewLevel: "safe",
              sourceAvailable: true,
              safeSourceText: "좋은 지적 감사합니다.",
              neutralText: null,
              normalizedQuestion: null,
            },
          ],
          total_count: 1,
        },
      ],
      error: null,
    });
    const repository = createSupabaseInboxRepository({ rpc });

    const result = await repository.query({
      workspaceId: "workspace-1",
      reviewLevels: ["caution", "risk"],
      category: "question",
      videoIds: ["video-1", "video-2"],
      analysisState: "analyzed",
      actionState: null,
      minConfidence: 0.5,
      maxConfidence: 1,
      search: "자막",
      limit: 25,
      offset: 0,
    });

    expect(rpc).toHaveBeenCalledWith("get_inbox_conversation_page", {
      target_workspace_id: "workspace-1",
      review_levels: ["caution", "risk"],
      category_filter: "question",
      video_ids: ["video-1", "video-2"],
      analysis_state_filter: "analyzed",
      action_state_filter: undefined,
      min_confidence: 0.5,
      max_confidence: 1,
      search_query: "자막",
      page_size: 25,
      page_offset: 0,
    });
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          rawCommentId: "comment-1",
          sourceImportJobId: "import-1",
          sourceKind: "owned_oauth",
          likeCount: 12,
          replyCount: 1,
          videoTitle: "등산 필수 장비 7가지",
          videoThumbnailUrl: "https://i.ytimg.com/example.jpg",
          analysisId: "analysis-1",
          classificationStatus: "decided",
          classificationTrace: expect.objectContaining({
            branch: expect.objectContaining({ outcome: "verify" }),
            final: expect.objectContaining({ level: "caution" }),
          }),
          reviewLevel: "caution",
          normalizedQuestion: "자막을 크게 할 수 있나요?",
          analysisState: "analyzed",
          actionState: null,
          deleteEligible: true,
          replies: [
            {
              rawCommentId: "reply-1",
              authorDisplayName: "creator_hj",
              authorAvatarUrl: null,
              publishedAt: "2026-07-28T10:10:00.000Z",
              likeCount: 5,
              reviewLevel: "safe",
              sourceAvailable: true,
              safeSourceText: "좋은 지적 감사합니다.",
              neutralText: null,
              normalizedQuestion: null,
            },
          ],
        }),
      ],
      total: 1,
    });
    expect(result.items[0]?.safeSourceText).toBe("안전 댓글 원문");
  });
});
