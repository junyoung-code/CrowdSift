import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
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

  it("lets the user select all comments and explains that replies are included", () => {
    render(<PublicVideoImportPanel {...actions} mode={{ configured: true, enabled: true }} />);
    fireEvent.change(screen.getByLabelText("댓글 수"), { target: { value: "0" } });
    expect(screen.getByLabelText("댓글 수")).toHaveValue("0");
    expect(screen.getByRole("option", { name: "전체 댓글" })).toBeInTheDocument();
    expect(screen.getByText(/공개 댓글과 답글을 모두 가져옵니다/)).toBeInTheDocument();
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
            fixtureLabel: "TEST FIXTURE",
          },
        }}
        mode={{ configured: true, enabled: true }}
      />,
    );

    expect(screen.getByText("테스트 공개 영상")).toBeInTheDocument();
    expect(screen.getByText("다른 크리에이터")).toBeInTheDocument();
    expect(screen.getByText("공개 URL")).toBeInTheDocument();
    expect(screen.getByText("읽기 전용")).toBeInTheDocument();
    expect(screen.getByText("TEST FIXTURE")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "20개" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "50개" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "100개" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "1,000개" })).toBeInTheDocument();
    expect(screen.getByText("Fixture 분석 비용")).toBeInTheDocument();
    expect(
      screen.getByText("$0.0000 · 외부 API 호출 없음"),
    ).toBeInTheDocument();
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
          providerMode: "fixture",
          sourceKind: "public_url",
          sourceLabel: "공개 URL",
          readOnly: true,
          requestedCount: 20,
          import: {
            status: "succeeded",
            observedCount: 20,
            storedCount: 17,
            updatedCount: 0,
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
            verdictCounts: {
              safe: 6,
              caution: 2,
              risk: 1,
              reviewQueue: 1,
            },
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
    expect(within(progress).getByText("새로 저장한 댓글")).toBeInTheDocument();
    expect(within(progress).getByText("중복 2")).toBeInTheDocument();
    expect(within(progress).getByText("최상위 12")).toBeInTheDocument();
    expect(within(progress).getByText("답글 8")).toBeInTheDocument();
    expect(within(progress).getByText("10 / 19")).toBeInTheDocument();
    const verdicts = within(progress).getByLabelText("분류 결과 집계");
    expect(verdicts).toHaveTextContent("안전6주의2위험1판단 보류1");
    expect(within(progress).getByText("TEST FIXTURE")).toBeInTheDocument();
    expect(within(progress).getByText(/수집 실패 1개/)).toBeInTheDocument();
  });
});

// Empty and failed jobs must never look like successful, real collection results.
describe("minimal collection states", () => {
  it("shows waiting placeholders before any collection", () => {
    render(<PublicVideoImportPanel {...actions} mode={{ configured: true, enabled: true }} />);
    const progress = screen.getByRole("region", { name: "공개 댓글 가져오기 진행 상태" });
    expect(within(progress).getByText("수집 전")).toBeInTheDocument();
    expect(within(progress).getByText("수집이 시작되면 결과가 표시됩니다.")).toBeInTheDocument();
    expect(within(progress).queryByRole("link")).not.toBeInTheDocument();
  });

  it("does not label failed imports as completed or offer an empty Inbox result", () => {
    render(<PublicVideoImportPanel {...actions} mode={{ configured: true, enabled: true }} pollingEnabled={false} initialJobId="failed-job" initialProgress={{
      jobId: "failed-job", providerMode: "live", sourceKind: "public_url", sourceLabel: "공개 URL", readOnly: true, requestedCount: 20,
      import: { status: "failed", observedCount: 0, storedCount: 0, updatedCount: 0, duplicateCount: 0, failedCount: 0, topLevelCount: 0, replyCount: 0, youtubeQuotaUnitsUsed: 0, errorCode: "provider_error" }, analysis: null,
    }} />);
    const progress = screen.getByRole("region", { name: "공개 댓글 가져오기 진행 상태" });
    expect(within(progress).getByText("수집 실패")).toBeInTheDocument();
    expect(within(progress).getByRole("alert")).toBeInTheDocument();
    expect(within(progress).queryByText("완료", { exact: true })).not.toBeInTheDocument();
    expect(within(progress).queryByRole("link")).not.toBeInTheDocument();
  });
});

it("retries only the existing failed analysis job and exposes a durable log download", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  try {
    render(<PublicVideoImportPanel {...actions} mode={{ configured: true, enabled: true }} pollingEnabled={false} initialJobId="import-resume" initialProgress={{
      jobId: "import-resume", providerMode: "live", sourceKind: "public_url", sourceLabel: "공개 URL", readOnly: true, requestedCount: 0,
      import: { status: "succeeded", observedCount: 102, storedCount: 102, updatedCount: 0, duplicateCount: 0, failedCount: 0, topLevelCount: 90, replyCount: 12, youtubeQuotaUnitsUsed: 3, errorCode: null },
      analysis: { jobId: "existing-analysis", status: "partially_succeeded", totalCount: 102, completedCount: 97, failedCount: 5, verdictCounts: { safe: 97, caution: 0, risk: 0, reviewQueue: 0 } },
    }} />);
    expect(screen.getByRole("link", { name: "작업 로그 저장" })).toHaveAttribute("href", "/api/import-jobs/import-resume/logs");
    fireEvent.click(screen.getByRole("button", { name: "실패한 5개만 재시도" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/analysis-jobs/existing-analysis/retry", { method: "POST" }));
  } finally { vi.unstubAllGlobals(); }
});
