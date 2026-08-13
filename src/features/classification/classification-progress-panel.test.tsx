import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ImportJobProgress } from "@/features/ingestion/import-job-progress";

import { ClassificationProgressPanel } from "./classification-progress-panel";

const pendingProgress: ImportJobProgress = {
  jobId: "import-1",
  providerMode: "live",
  sourceKind: "owned_oauth",
  sourceLabel: "내 채널",
  readOnly: false,
  requestedCount: 20,
  import: {
    status: "succeeded",
    observedCount: 9,
    storedCount: 9,
    updatedCount: 0,
    duplicateCount: 0,
    failedCount: 0,
    topLevelCount: 9,
    replyCount: 0,
    youtubeQuotaUnitsUsed: 1,
    errorCode: null,
  },
  analysis: {
    jobId: "analysis-1",
    status: "pending",
    totalCount: 9,
    completedCount: 0,
    failedCount: 0,
    verdictCounts: { safe: 0, caution: 0, risk: 0, reviewQueue: 0 },
  },
};

const completedProgress: ImportJobProgress = {
  ...pendingProgress,
  analysis: {
    jobId: "analysis-1",
    status: "succeeded",
    totalCount: 9,
    completedCount: 9,
    failedCount: 0,
    verdictCounts: { safe: 5, caution: 2, risk: 1, reviewQueue: 1 },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ClassificationProgressPanel", () => {
  it("does not spend model calls before the owned-channel start button is clicked", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ClassificationProgressPanel
        importJobId="import-1"
        initialProgress={pendingProgress}
      />,
    );

    expect(
      screen.getByRole("button", { name: "안전·주의·위험 분류 시작" }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("processes bounded chunks and shows every final verdict count", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: {} }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: completedProgress }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ClassificationProgressPanel
        importJobId="import-1"
        initialProgress={pendingProgress}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "안전·주의·위험 분류 시작" }),
    );

    await waitFor(() => {
      expect(screen.getByText("분류 완료")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/analysis-jobs/analysis-1/process?maxItems=5",
      { method: "POST" },
    );
    expect(screen.getByText("안전 5")).toBeInTheDocument();
    expect(screen.getByText("주의 2")).toBeInTheDocument();
    expect(screen.getByText("위험 1")).toBeInTheDocument();
    expect(screen.getByText("판단 보류 1")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Comment Inbox에서 보기" }),
    ).toHaveAttribute("href", "/app/inbox");
  });
});
