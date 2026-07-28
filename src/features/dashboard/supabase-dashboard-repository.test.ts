import { describe, expect, it, vi } from "vitest";

import { createSupabaseDashboardRepository } from "./supabase-dashboard-repository";

describe("Supabase dashboard repository", () => {
  it("maps one persisted RPC snapshot without inventing values", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          imported_count: 37,
          analyzed_count: 35,
          safe_count: 25,
          caution_count: 8,
          risk_count: 2,
          pending_review_count: 10,
          selected_channel: {
            youtubeChannelId: "channel-1",
            title: "내 채널",
            handle: "@creator",
            thumbnailUrl: null,
          },
          latest_video: {
            youtubeVideoId: "video-1",
            title: "새 영상",
            thumbnailUrl: null,
            publishedAt: "2026-07-23T00:00:00.000Z",
          },
          latest_import_job: {
            id: "import-1",
            sourceKind: "owned_oauth",
            status: "succeeded",
            requestedTopLevelCount: 40,
            requestedTotalCount: null,
            fetchedCount: 38,
            storedCount: 37,
            duplicateCount: 0,
            failedCount: 1,
            topLevelCount: 37,
            replyCount: 1,
            youtubeQuotaUnitsUsed: 3,
            createdAt: "2026-07-23T00:01:00.000Z",
          },
          latest_analysis_job: {
            id: "analysis-1",
            sourceKind: "owned_oauth",
            status: "partially_succeeded",
            totalCount: 37,
            completedCount: 35,
            failedCount: 2,
            createdAt: "2026-07-23T00:02:00.000Z",
          },
          latest_analysis_cost: null,
          priority_comments: [
            {
              rawCommentId: "comment-1",
              reviewLevel: "risk",
              category: "phishing",
              sanitizedText: "외부 링크 클릭을 유도하는 댓글",
            },
          ],
          recent_corrections: [],
          recent_actions: [],
          latest_summary: "실제 분석을 바탕으로 만든 요약",
          latest_summary_source_count: 35,
        },
      ],
      error: null,
    });
    const repository = createSupabaseDashboardRepository({ rpc });

    await expect(repository.loadSnapshot("workspace-1")).resolves.toEqual({
      importedCount: 37,
      analyzedCount: 35,
      safeCount: 25,
      cautionCount: 8,
      riskCount: 2,
      selectedChannel: {
        youtubeChannelId: "channel-1",
        title: "내 채널",
        handle: "@creator",
        thumbnailUrl: null,
      },
      latestVideo: {
        youtubeVideoId: "video-1",
        title: "새 영상",
        thumbnailUrl: null,
        publishedAt: "2026-07-23T00:00:00.000Z",
      },
      latestImportJob: {
        id: "import-1",
        sourceKind: "owned_oauth",
        status: "succeeded",
        total: 40,
        completed: 37,
        failed: 1,
        observed: 38,
        duplicates: 0,
        topLevelCount: 37,
        replyCount: 1,
        youtubeQuotaUnitsUsed: 3,
        createdAt: "2026-07-23T00:01:00.000Z",
      },
      latestAnalysisJob: {
        id: "analysis-1",
        sourceKind: "owned_oauth",
        status: "partially_succeeded",
        total: 37,
        completed: 35,
        failed: 2,
        createdAt: "2026-07-23T00:02:00.000Z",
      },
      latestCost: null,
      priorityComments: [
        {
          rawCommentId: "comment-1",
          reviewLevel: "risk",
          category: "phishing",
          sanitizedText: "외부 링크 클릭을 유도하는 댓글",
        },
      ],
      recentCorrections: [],
      recentActions: [],
      latestSummary: "실제 분석을 바탕으로 만든 요약",
    });
    expect(rpc).toHaveBeenCalledWith("get_dashboard_summary", {
      target_workspace_id: "workspace-1",
    });
  });
});
