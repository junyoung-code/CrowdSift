import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommentInbox } from "./comment-inbox";
import type { InboxItem } from "./inbox-query";

const item: InboxItem = {
  rawCommentId: "comment-1",
  sourceImportJobId: "import-1",
  sourceKind: "owned_oauth",
  youtubeVideoId: "video-1",
  authorDisplayName: "시청자",
  authorAvatarUrl: null,
  publishedAt: "2026-07-23T00:00:00.000Z",
  sourceAvailable: true,
  safeSourceText: null,
  analysisId: "analysis-1",
  category: "toxic_but_actionable",
  reviewLevel: "caution",
  confidence: 0.82,
  recommendedAction: "review",
  manualReview: true,
  neutralText: "자막 크기를 키워 달라는 요청",
  normalizedQuestion: null,
  analysisState: "analyzed",
  actionState: null,
  deleteEligible: false,
};

const renderInbox = (
  inboxItem: InboxItem,
  reviewLevels = ["caution", "risk"] as const,
) =>
  render(
    <CommentInbox
      correctionAction={vi.fn()}
      moderationAction={vi.fn()}
      data={{ items: [inboxItem], total: 1 }}
      filters={{ reviewLevels: [...reviewLevels] }}
      videos={[{ id: "video-1", title: "새 영상" }]}
    />,
  );

describe("CommentInbox", () => {
  it("shows sanitized feedback and never embeds source text in the list", () => {
    render(
      <CommentInbox
        correctionAction={vi.fn()}
        moderationAction={vi.fn()}
        data={{ items: [item], total: 1 }}
        filters={{ reviewLevels: ["caution", "risk"] }}
        videos={[{ id: "video-1", title: "새 영상" }]}
      />,
    );

    expect(
      screen.getByText("자막 크기를 키워 달라는 요청", {
        selector: ".inbox-sanitized-feedback",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("주의", { selector: ".review-level" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("유해하지만 참고할 내용 있음", { selector: "dd" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("원문에만 있는 유해 표현")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "원문 확인" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: /^내 기준 개인화에 사용/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: /^향후 공통 모델 학습 후보로 표시/,
      }),
    ).toBeInTheDocument();
  });

  it("shows safe source immediately without a reveal button", () => {
    renderInbox(
      {
        ...item,
        reviewLevel: "safe",
        category: "positive",
        safeSourceText: "오늘 영상도 잘 봤어요.",
      },
      ["safe"],
    );

    expect(screen.getByText("오늘 영상도 잘 봤어요.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "원문 확인" }),
    ).not.toBeInTheDocument();
  });

  it.each(["caution", "risk"] as const)(
    "does not embed %s source in the initial card",
    (reviewLevel) => {
      renderInbox({
        ...item,
        reviewLevel,
        safeSourceText: null,
      });

      expect(
        screen.queryByText("원문에만 있는 표현"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "원문 확인" }),
      ).toBeInTheDocument();
    },
  );

  it("explains why no numbers are shown when the queue is empty", () => {
    render(
      <CommentInbox
        correctionAction={vi.fn()}
        moderationAction={vi.fn()}
        data={{ items: [], total: 0 }}
        filters={{ reviewLevels: ["caution", "risk"] }}
        videos={[]}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "현재 조건에 맞는 댓글이 없습니다" }),
    ).toBeInTheDocument();
  });

  it("keeps active filters in pagination links", () => {
    render(
      <CommentInbox
        correctionAction={vi.fn()}
        moderationAction={vi.fn()}
        data={{ items: [item], total: 30 }}
        filters={{
          reviewLevels: ["caution", "risk"],
          category: "toxic_but_actionable",
        }}
        videos={[]}
      />,
    );

    expect(
      screen.getByRole("link", { name: "다음 페이지" }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(
        /\/app\/inbox\?.*levels=caution.*levels=risk.*category=toxic_but_actionable.*page=2/,
      ),
    );
  });

  it("shows exact moderation actions and only exposes delete when eligible", () => {
    const { rerender } = render(
      <CommentInbox
        correctionAction={vi.fn()}
        moderationAction={vi.fn()}
        data={{ items: [item], total: 1 }}
        filters={{ reviewLevels: ["caution", "risk"] }}
        videos={[]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "검토 대기로 이동" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "게시 승인" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "거절하여 숨기기" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "내 댓글 영구 삭제" }),
    ).not.toBeInTheDocument();

    rerender(
      <CommentInbox
        correctionAction={vi.fn()}
        moderationAction={vi.fn()}
        data={{
          items: [{ ...item, deleteEligible: true }],
          total: 1,
        }}
        filters={{ reviewLevels: ["caution", "risk"] }}
        videos={[]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "내 댓글 영구 삭제" }),
    ).toBeInTheDocument();
  });

  it("marks public observations read-only and removes write-only controls", () => {
    render(
      <CommentInbox
        correctionAction={vi.fn()}
        moderationAction={vi.fn()}
        data={{
          items: [
            {
              ...item,
              sourceImportJobId: "public-import-1",
              sourceKind: "public_url",
            },
          ],
          total: 1,
        }}
        filters={{ reviewLevels: ["caution", "risk"] }}
        videos={[]}
      />,
    );

    expect(screen.getByText("공개 URL")).toBeInTheDocument();
    expect(screen.getByText("읽기 전용")).toBeInTheDocument();
    expect(
      screen.getByText(/YouTube 조치는 사용할 수 없습니다/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "검토 대기로 이동" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", {
        name: /^내 기준 개인화에 사용/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", {
        name: /^향후 공통 모델 학습 후보로 표시/,
      }),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector(
        'input[name="sourceImportJobId"][value="public-import-1"]',
      ),
    ).toBeInTheDocument();
  });
});
