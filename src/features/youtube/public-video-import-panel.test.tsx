import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PublicVideoImportPanel } from "./public-video-import-panel";

const actions = {
  previewAction: vi.fn(),
  startAction: vi.fn(),
};

describe("PublicVideoImportPanel", () => {
  it("does not render when the development flag is off", () => {
    const { container } = render(
      <PublicVideoImportPanel
        {...actions}
        mode={{ configured: false, enabled: false }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows setup guidance without exposing a URL form when the key is missing", () => {
    render(
      <PublicVideoImportPanel
        {...actions}
        mode={{ configured: false, enabled: true }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "서버 API Key 설정이 필요합니다" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("공개 YouTube 영상 URL"),
    ).not.toBeInTheDocument();
  });

  it("renders a URL form and defaults the requested total to 20", () => {
    render(
      <PublicVideoImportPanel
        {...actions}
        mode={{ configured: true, enabled: true }}
      />,
    );

    expect(
      screen.getByLabelText("공개 YouTube 영상 URL"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("댓글 수")).toHaveValue("20");
    expect(
      screen.getByRole("button", { name: "영상 확인" }),
    ).toBeInTheDocument();
  });

  it("shows verified metadata, read-only provenance, choices, and cost before start", () => {
    render(
      <PublicVideoImportPanel
        {...actions}
        initialPreviewState={{
          status: "success",
          preview: {
            videoId: "dQw4w9WgXcQ",
            canonicalUrl:
              "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            title: "테스트 공개 영상",
            channelId: "channel-1",
            channelTitle: "다른 크리에이터",
            thumbnailUrl: "https://i.ytimg.com/example.jpg",
            commentsAvailable: true,
            commentCount: 1250,
            quotaUnitsUsed: 1,
          },
        }}
        mode={{ configured: true, enabled: true }}
      />,
    );

    expect(screen.getByText("테스트 공개 영상")).toBeInTheDocument();
    expect(screen.getByText("다른 크리에이터")).toBeInTheDocument();
    expect(screen.getByText("공개 URL")).toBeInTheDocument();
    expect(screen.getByText("읽기 전용")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "20개" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "50개" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "100개" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "1,000개" })).toBeInTheDocument();
    expect(screen.getByText(/예상 OpenAI 비용/)).toBeInTheDocument();
    expect(screen.getByText(/YouTube quota/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "댓글 가져오기 및 분석 시작",
      }),
    ).toBeInTheDocument();
  });

  it("shows persisted import and analysis progress without fabricated metrics", () => {
    render(
      <PublicVideoImportPanel
        {...actions}
        initialJobId="job-1"
        initialProgress={{
          jobId: "job-1",
          sourceKind: "public_url",
          sourceLabel: "공개 URL",
          readOnly: true,
          requestedCount: 20,
          import: {
            status: "succeeded",
            observedCount: 20,
            storedCount: 17,
            duplicateCount: 2,
            failedCount: 1,
            topLevelCount: 12,
            replyCount: 8,
            youtubeQuotaUnitsUsed: 4,
            errorCode: null,
          },
          analysis: {
            jobId: "analysis-1",
            status: "running",
            totalCount: 19,
            completedCount: 10,
            failedCount: 0,
          },
        }}
        mode={{ configured: true, enabled: true }}
        pollingEnabled={false}
      />,
    );

    const progress = screen.getByRole("region", {
      name: "공개 댓글 가져오기 진행 상태",
    });

    expect(within(progress).getByText("확인 20")).toBeInTheDocument();
    expect(within(progress).getByText("신규 17")).toBeInTheDocument();
    expect(within(progress).getByText("중복 2")).toBeInTheDocument();
    expect(within(progress).getByText("최상위 12")).toBeInTheDocument();
    expect(within(progress).getByText("답글 8")).toBeInTheDocument();
    expect(within(progress).getByText("10 / 19")).toBeInTheDocument();
    expect(
      within(progress).getByText("규칙 검사 · 1차 AI · 필요 시 2차 AI"),
    ).toBeInTheDocument();
  });
});
