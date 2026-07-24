import { describe, expect, it, vi } from "vitest";

import {
  getDashboardData,
  type DashboardRepository,
} from "./dashboard-query";

describe("dashboard query", () => {
  it("returns disconnected without fabricating metrics", async () => {
    const repository: DashboardRepository = {
      loadSnapshot: vi.fn().mockResolvedValue({
        importedCount: 0,
        analyzedCount: 0,
        safeCount: 0,
        cautionCount: 0,
        riskCount: 0,
        selectedChannel: null,
        latestVideo: null,
        latestImportJob: null,
        latestAnalysisJob: null,
        priorityComments: [],
        recentCorrections: [],
        recentActions: [],
        latestSummary: null,
      }),
    };

    await expect(
      getDashboardData("workspace-1", repository),
    ).resolves.toEqual({ state: "disconnected" });
  });

  it("returns connected empty until real comments exist", async () => {
    const channel = {
      youtubeChannelId: "channel-1",
      title: "내 채널",
      handle: "@creator",
      thumbnailUrl: null,
    };
    const repository: DashboardRepository = {
      loadSnapshot: vi.fn().mockResolvedValue({
        importedCount: 0,
        analyzedCount: 0,
        safeCount: 0,
        cautionCount: 0,
        riskCount: 0,
        selectedChannel: channel,
        latestVideo: null,
        latestImportJob: null,
        latestAnalysisJob: null,
        priorityComments: [],
        recentCorrections: [],
        recentActions: [],
        latestSummary: null,
      }),
    };

    await expect(
      getDashboardData("workspace-1", repository),
    ).resolves.toEqual({ state: "connected_empty", channel });
  });

  it("returns public URL data without requiring an owned channel", async () => {
    const repository: DashboardRepository = {
      loadSnapshot: vi.fn().mockResolvedValue({
        importedCount: 17,
        analyzedCount: 15,
        safeCount: 8,
        cautionCount: 5,
        riskCount: 2,
        selectedChannel: null,
        latestVideo: {
          youtubeVideoId: "dQw4w9WgXcQ",
          title: "공개 영상",
          thumbnailUrl: null,
          publishedAt: null,
        },
        latestImportJob: {
          id: "public-import-1",
          sourceKind: "public_url",
          status: "succeeded",
          total: 20,
          completed: 17,
          failed: 1,
          observed: 20,
          duplicates: 2,
          topLevelCount: 12,
          replyCount: 8,
          youtubeQuotaUnitsUsed: 4,
          createdAt: "2026-07-24T00:00:00.000Z",
        },
        latestAnalysisJob: {
          id: "analysis-1",
          sourceKind: "public_url",
          status: "succeeded",
          total: 19,
          completed: 18,
          failed: 1,
          createdAt: "2026-07-24T00:01:00.000Z",
        },
        latestCost: {
          currency: "USD",
          pricingVersion: "openai-2026-07-24",
          estimatedCostLow: 0.001,
          estimatedCostHigh: 0.003,
          actualCalculatedCost: 0.002,
          stageOneModel: "gpt-5.4-nano",
          stageTwoModel: "gpt-5.4-mini",
          embeddingModel: "text-embedding-3-small",
        },
        priorityComments: [],
        recentCorrections: [],
        recentActions: [],
        latestSummary: null,
      }),
    };

    await expect(
      getDashboardData("workspace-1", repository),
    ).resolves.toEqual(
      expect.objectContaining({
        state: "ready",
        channel: null,
        sourceKind: "public_url",
      }),
    );
  });
});
