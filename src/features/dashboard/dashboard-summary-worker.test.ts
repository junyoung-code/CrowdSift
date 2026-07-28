import { describe, expect, it, vi } from "vitest";

import { processDashboardSummaryQueue } from "./dashboard-summary-worker";

describe("dashboard summary worker", () => {
  it("scans retryable jobs and bounds each job to three durable attempts", async () => {
    const listRetryableJobs = vi
      .fn()
      .mockResolvedValue(["job-success", "job-failed"]);
    const createSummary = vi.fn(async (jobId: string) => {
      if (jobId === "job-failed") {
        throw new Error("provider unavailable");
      }
      return { id: "summary-1" };
    });
    const onError = vi.fn();

    await expect(
      processDashboardSummaryQueue({
        createSummary,
        listRetryableJobs,
        maxJobs: 5,
        onError,
      }),
    ).resolves.toEqual({
      scanned: 2,
      succeeded: 1,
      failed: 1,
    });

    expect(listRetryableJobs).toHaveBeenCalledWith(5);
    expect(createSummary).toHaveBeenCalledTimes(4);
    expect(onError).toHaveBeenCalledTimes(3);
  });

  it("rejects an unbounded worker batch", async () => {
    await expect(
      processDashboardSummaryQueue({
        createSummary: vi.fn(),
        listRetryableJobs: vi.fn(),
        maxJobs: 26,
      }),
    ).rejects.toThrow("Dashboard summary worker batch must be between 1 and 25");
  });
});
