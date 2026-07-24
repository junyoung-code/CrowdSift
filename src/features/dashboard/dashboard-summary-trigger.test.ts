import { describe, expect, it, vi } from "vitest";

import { triggerDashboardSummaryWhenComplete } from "./dashboard-summary-trigger";

const completedProgress = {
  status: "succeeded",
  total: 10,
  completed: 10,
  failed: 0,
  remaining: 0,
};

describe("dashboard summary trigger", () => {
  it("creates a summary only after the analysis job reaches a terminal state", async () => {
    const createSummary = vi.fn().mockResolvedValue(null);

    await expect(
      triggerDashboardSummaryWhenComplete({
        jobId: "job-1",
        progress: completedProgress,
        createSummary,
      }),
    ).resolves.toEqual(completedProgress);
    expect(createSummary).toHaveBeenCalledWith("job-1");
  });

  it("does not fail a completed analysis job when optional summary creation fails", async () => {
    const createSummary = vi.fn().mockRejectedValue(new Error("provider down"));

    await expect(
      triggerDashboardSummaryWhenComplete({
        jobId: "job-1",
        progress: completedProgress,
        createSummary,
      }),
    ).resolves.toEqual(completedProgress);
    expect(createSummary).toHaveBeenCalledTimes(3);
  });

  it("retries a durable summary job with bounded attempts and recovers", async () => {
    const createSummary = vi
      .fn()
      .mockRejectedValueOnce(new Error("provider down"))
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce({ id: "summary-1" });
    const onError = vi.fn();

    await expect(
      triggerDashboardSummaryWhenComplete({
        jobId: "job-1",
        progress: completedProgress,
        createSummary,
        onError,
      }),
    ).resolves.toEqual(completedProgress);

    expect(createSummary).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("does not create a summary while analysis items remain", async () => {
    const createSummary = vi.fn();
    const progress = { ...completedProgress, status: "running", remaining: 2 };

    await triggerDashboardSummaryWhenComplete({
      jobId: "job-1",
      progress,
      createSummary,
    });

    expect(createSummary).not.toHaveBeenCalled();
  });
});
