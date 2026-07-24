import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockProcessRetryableDashboardSummaries } = vi.hoisted(() => ({
  mockProcessRetryableDashboardSummaries: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: vi.fn(() => ({
    INTERNAL_WORKER_SECRET: "w".repeat(32),
  })),
}));

vi.mock("@/features/dashboard/process-dashboard-summary-queue", () => ({
  processRetryableDashboardSummaries:
    mockProcessRetryableDashboardSummaries,
}));

import { POST } from "./route";

describe("POST /api/internal/dashboard-summaries/process", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessRetryableDashboardSummaries.mockResolvedValue({
      scanned: 1,
      succeeded: 1,
      failed: 0,
    });
  });

  it("rejects a request without the internal worker bearer secret", async () => {
    const response = await POST(
      new Request(
        "http://localhost:3000/api/internal/dashboard-summaries/process",
        { method: "POST" },
      ),
    );

    expect(response.status).toBe(401);
    expect(mockProcessRetryableDashboardSummaries).not.toHaveBeenCalled();
  });

  it("processes a bounded retry batch for an authorized worker", async () => {
    const response = await POST(
      new Request(
        "http://localhost:3000/api/internal/dashboard-summaries/process",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${"w".repeat(32)}`,
          },
        },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      scanned: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(mockProcessRetryableDashboardSummaries).toHaveBeenCalledWith(5);
  });
});
