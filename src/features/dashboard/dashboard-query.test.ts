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
});
