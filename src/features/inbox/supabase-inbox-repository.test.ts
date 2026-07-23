import { describe, expect, it, vi } from "vitest";

import { createSupabaseInboxRepository } from "./supabase-inbox-repository";

describe("Supabase Inbox repository", () => {
  it("maps domain filters to the scoped Inbox RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          raw_comment_id: "comment-1",
          youtube_video_id: "video-1",
          author_display_name: "시청자",
          author_avatar_url: null,
          published_at: "2026-07-23T00:00:00.000Z",
          source_available: true,
          analysis_id: "analysis-1",
          category: "question",
          review_level: "caution",
          confidence: 0.82,
          recommended_action: "review",
          manual_review: true,
          neutral_text: null,
          normalized_question: "자막을 크게 할 수 있나요?",
          analysis_state: "analyzed",
          action_state: null,
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
      videoId: "video-1",
      analysisState: "analyzed",
      actionState: null,
      minConfidence: 0.5,
      maxConfidence: 1,
      search: "자막",
      limit: 25,
      offset: 0,
    });

    expect(rpc).toHaveBeenCalledWith("get_inbox_page", {
      target_workspace_id: "workspace-1",
      review_levels: ["caution", "risk"],
      category_filter: "question",
      video_id: "video-1",
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
          analysisId: "analysis-1",
          reviewLevel: "caution",
          normalizedQuestion: "자막을 크게 할 수 있나요?",
          analysisState: "analyzed",
          actionState: null,
        }),
      ],
      total: 1,
    });
  });
});
