import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DashboardView,
  type DashboardData,
} from "./dashboard-view";

const readyData = (
  metrics: {
    imported: number;
    analyzed: number;
    caution: number;
    risk: number;
  },
): DashboardData => ({
  state: "ready",
  channel: {
    youtubeChannelId: "channel-1",
    title: "내 채널",
    handle: "@creator",
    thumbnailUrl: null,
  },
  video: {
    youtubeVideoId: "video-1",
    title: "새 영상",
    thumbnailUrl: null,
    publishedAt: "2026-07-23T00:00:00.000Z",
  },
  metrics,
  distribution: {
    safe: metrics.analyzed - metrics.caution - metrics.risk,
    caution: metrics.caution,
    risk: metrics.risk,
  },
  latestImport: {
    id: "import-1",
    status: "succeeded",
    total: 37,
    completed: 37,
    failed: 0,
    createdAt: "2026-07-23T00:00:00.000Z",
  },
  latestAnalysis: {
    id: "analysis-job-1",
    status: "succeeded",
    total: 37,
    completed: 35,
    failed: 2,
    createdAt: "2026-07-23T00:05:00.000Z",
  },
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
  aiSummary: "주의 댓글에는 자막 개선 요청이 반복됩니다.",
});

describe("DashboardView", () => {
  it("shows no metrics when disconnected", () => {
    render(<DashboardView data={{ state: "disconnected" }} />);

    expect(screen.queryByText("가져온 댓글")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "YouTube 연결하기" }),
    ).toBeInTheDocument();
  });

  it("renders only repository metrics when ready", () => {
    render(
      <DashboardView
        data={readyData({
          imported: 37,
          analyzed: 35,
          caution: 8,
          risk: 2,
        })}
      />,
    );

    expect(screen.getByText("37")).toBeInTheDocument();
    expect(screen.getByText("35")).toBeInTheDocument();
    expect(screen.queryByText("25,627")).not.toBeInTheDocument();
    expect(
      screen.getByText("외부 링크 클릭을 유도하는 댓글"),
    ).toBeInTheDocument();
  });

  it("shows an honest empty state after a channel is selected", () => {
    render(
      <DashboardView
        data={{
          state: "connected_empty",
          channel: {
            youtubeChannelId: "channel-1",
            title: "내 채널",
            handle: "@creator",
            thumbnailUrl: null,
          },
        }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "첫 댓글 가져오기" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("가져온 댓글")).not.toBeInTheDocument();
  });

  it("renders moderation actions with creator-facing Korean labels", () => {
    const data = readyData({
      imported: 37,
      analyzed: 35,
      caution: 8,
      risk: 2,
    });
    if (data.state !== "ready") {
      throw new Error("Expected ready dashboard data");
    }
    data.recentActions = [
      {
        id: "action-1",
        action: "hold_for_review",
        state: "pending_confirmation",
        createdAt: "2026-07-23T00:10:00.000Z",
      },
    ];

    render(<DashboardView data={data} />);

    expect(screen.getByText("검토 대기로 이동")).toBeInTheDocument();
    expect(screen.getByText("사용자 확인 대기")).toBeInTheDocument();
    expect(screen.queryByText("hold_for_review")).not.toBeInTheDocument();
    expect(screen.queryByText("pending_confirmation")).not.toBeInTheDocument();
  });
});
