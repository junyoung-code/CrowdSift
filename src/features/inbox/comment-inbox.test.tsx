import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommentInbox } from "./comment-inbox";
import type { InboxItem } from "./inbox-query";

const item: InboxItem = {
  rawCommentId: "comment-1",
  sourceImportJobId: "import-1",
  sourceKind: "owned_oauth",
  youtubeVideoId: "video-1",
  videoTitle: "새 영상",
  videoThumbnailUrl: null,
  authorDisplayName: "시청자",
  authorAvatarUrl: null,
  publishedAt: "2026-07-23T00:00:00.000Z",
  likeCount: 12,
  sourceAvailable: true,
  safeSourceText: "주의 댓글 원문",
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
  replyCount: 3,
  replies: [
    {
      rawCommentId: "reply-1",
      authorDisplayName: "채널 운영자",
      authorAvatarUrl: null,
      publishedAt: "2026-07-23T00:10:00.000Z",
      likeCount: 3,
      reviewLevel: "safe",
      sourceAvailable: true,
      safeSourceText: "확인해서 다음 영상에 반영할게요.",
      neutralText: null,
      normalizedQuestion: null,
    },
    {
      rawCommentId: "reply-2",
      authorDisplayName: "다른 시청자",
      authorAvatarUrl: null,
      publishedAt: "2026-07-23T00:20:00.000Z",
      likeCount: 0,
      reviewLevel: "caution",
      sourceAvailable: true,
      safeSourceText: "주의 답글 원문",
      neutralText: "같은 개선 요청",
      normalizedQuestion: null,
    },
    {
      rawCommentId: "reply-3",
      authorDisplayName: "보호 대상 시청자",
      authorAvatarUrl: null,
      publishedAt: "2026-07-23T00:30:00.000Z",
      likeCount: 0,
      reviewLevel: "risk",
      sourceAvailable: true,
      safeSourceText: null,
      neutralText: "위험 답글 요약",
      normalizedQuestion: null,
    },
  ],
};

const renderInbox = (
  inboxItem: InboxItem,
  reviewLevels: Array<NonNullable<InboxItem["reviewLevel"]>> = [
    "caution",
    "risk",
  ],
) =>
  render(
    <CommentInbox
      correctionAction={vi.fn()}
      moderationAction={vi.fn()}
      data={{ items: [inboxItem], total: 1 }}
      filters={{ reviewLevels }}
      videos={[{ id: "video-1", title: "새 영상" }]}
    />,
  );

describe("CommentInbox", () => {
  it("shows caution source text in the queue preview", () => {
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
      screen.getByText("주의 댓글 원문", {
        selector: ".inbox-sanitized-feedback",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("자막 크기를 키워 달라는 요청", {
        selector: ".inbox-sanitized-feedback",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText("주의", { selector: ".review-level" }),
    ).not.toHaveLength(0);
    expect(
      screen.getByText("유해하지만 참고할 내용 있음", { selector: "dd" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("주의 댓글 원문", {
        selector: ".comment-source-text",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "원문 확인" }),
    ).not.toBeInTheDocument();
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

  it("keeps risk source text out of the queue preview", () => {
    renderInbox({
      ...item,
      reviewLevel: "risk",
      safeSourceText: "위험 댓글 원문",
      neutralText: "위험 댓글 요약",
    });

    expect(
      screen.getByText("위험 댓글 요약", {
        selector: ".inbox-sanitized-feedback",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("위험 댓글 원문", {
        selector: ".inbox-sanitized-feedback",
      }),
    ).not.toBeInTheDocument();
  });

  it("falls back to the summary when caution source text is unavailable", () => {
    renderInbox({
      ...item,
      sourceAvailable: false,
      safeSourceText: null,
      neutralText: "원문을 사용할 수 없는 주의 댓글 요약",
    });

    expect(
      screen.getByText("원문을 사용할 수 없는 주의 댓글 요약", {
        selector: ".inbox-sanitized-feedback",
      }),
    ).toBeInTheDocument();
  });

  it("shows the selected conversation with reply disclosure and an honest locked composer", () => {
    renderInbox(item);

    expect(
      screen.getByRole("link", { name: "답글 3개 보기" }),
    ).toHaveAttribute("href", expect.stringContaining("selected=comment-1"));
    expect(
      screen.getByRole("heading", { name: "댓글 대화" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("확인해서 다음 영상에 반영할게요."),
    ).toBeInTheDocument();
    expect(screen.getByText("주의 답글 원문")).toBeInTheDocument();
    expect(screen.getByText("위험 답글 요약")).toBeInTheDocument();
    expect(screen.queryByText("위험 답글 원문")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "위험 답글 원문 확인" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "답글 작성은 YouTube 게시·증거 저장 구현 후 사용할 수 있습니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "답글 보내기" })).toBeDisabled();
  });

  it("uses stored profile and video images when the source provides them", () => {
    renderInbox({
      ...item,
      authorAvatarUrl: "https://example.com/viewer.jpg",
      videoThumbnailUrl: "https://example.com/video.jpg",
    });

    expect(
      screen.getAllByRole("img", { name: "시청자 프로필" }),
    ).not.toHaveLength(0);
    expect(
      screen.getByRole("img", { name: "새 영상 썸네일" }),
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

    expect(
      screen.getByText("오늘 영상도 잘 봤어요.", {
        selector: ".comment-source-text",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "원문 확인" }),
    ).not.toBeInTheDocument();
  });

  it("shows caution source immediately without a reveal button", () => {
    renderInbox({
      ...item,
      safeSourceText: "주의 댓글 원문",
    });

    expect(
      screen.getByText("주의 댓글 원문", {
        selector: ".comment-source-text",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "원문 확인" }),
    ).not.toBeInTheDocument();
  });

  it("keeps risk source out of the initial card and offers acknowledgment", () => {
    renderInbox({
      ...item,
      reviewLevel: "risk",
      safeSourceText: null,
      neutralText: "위험 댓글 요약",
    });

    expect(screen.queryByText("위험 댓글 원문")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "원문 확인" }),
    ).toBeInTheDocument();
  });

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
