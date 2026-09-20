import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CommentInbox } from "./comment-inbox";
import type { InboxClassificationTrace, InboxItem } from "./inbox-query";

afterEach(() => {
  vi.useRealTimers();
});

const certaintyTrace: InboxClassificationTrace = {
  moderation: null,
  luna: {
    status: "succeeded",
    modelIdentifier: "gpt-5.6-luna",
    providerResponseId: "resp-luna",
    promptVersion: "luna-v1",
    latencyMs: 100,
    usage: {},
    output: {
      candidateLevel: "caution",
      certainty: "borderline",
      softRiskFlags: ["mockery"],
    },
    errorCode: null,
  },
  branch: {
    outcome: "verify",
    reasons: ["luna_caution"],
    protection: { hideSourceBeforeVerdict: true },
  },
  terra: {
    status: "succeeded",
    modelIdentifier: "gpt-5.6-terra",
    providerResponseId: "resp-terra",
    promptVersion: "terra-v1",
    latencyMs: 180,
    usage: {},
    output: {
      verdictLevel: "caution",
      certainty: "clear",
      reasonCodes: ["actionable_feedback"],
    },
    errorCode: null,
  },
  final: {
    status: "decided",
    level: "caution",
    basis: "both_agreed",
    hideSource: true,
    raisedByModeration: false,
    reasonCodes: ["actionable_feedback"],
    recommendedActions: ["review"],
  },
};

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
  classificationStatus: "decided",
  aiClassificationStatus: "decided",
  resolvedByUser: false,
  classificationTrace: null,
  category: "toxic_but_actionable",
  reviewLevel: "caution",
  aiReviewLevel: "caution",
  confidence: 0.82,
  recommendedAction: "review",
  manualReview: true,
  neutralText: "자막 크기를 키워 달라는 요청",
  normalizedQuestion: null,
  analysisState: "analyzed",
  actionState: null,
  sourceModerationStatus: null,
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

const renderInbox = (overrides: Partial<InboxItem> = {}, selected = false) => render(
  <CommentInbox
    correctionAction={vi.fn()} moderationAction={vi.fn()}
    data={{ items: [{ ...item, ...overrides }], total: 1 }}
    filters={{ reviewLevels: ["safe", "caution", "risk"] }}
    selectedCommentId={selected ? item.rawCommentId : null}
    videos={[{ id: "video-1", title: "새 영상" }]}
  />
);

describe("Comment Inbox feed", () => {
  it("shows refined caution feedback once and keeps the raw text out of the DOM", () => {
    renderInbox();
    expect(screen.getAllByText("자막 크기를 키워 달라는 요청", { selector: "p" })).toHaveLength(1);
    expect(screen.queryByText("주의 댓글 원문")).not.toBeInTheDocument();
    expect(screen.getByText("거친 표현 포함")).toBeVisible();
    expect(screen.getByRole("button", { name: "원문 보기" })).toBeVisible();
  });
  it("requires a warning before fetching the source", () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    renderInbox();
    fireEvent.click(screen.getByRole("button", { name: "원문 보기" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("유해한 표현이 포함될 수 있습니다");
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRestore();
  });
  it("shows safe source directly without claiming an AI rewrite", () => {
    renderInbox({ reviewLevel: "safe", safeSourceText: "설명이 좋았어요", replies: [], replyCount: 0 });
    expect(screen.getByText("설명이 좋았어요")).toBeVisible();
    expect(screen.queryByRole("button", { name: "원문 보기" })).not.toBeInTheDocument();
    expect(screen.queryByAltText("시프티가 표현을 정리했어요")).not.toBeInTheDocument();
  });
  it("explains why a safe comment with non-creator harm stays protected", () => {
    renderInbox({
      reviewLevel: "safe",
      safeSourceText: null,
      classificationTrace: {
        ...certaintyTrace,
        semantic: {
          version: "semantic-v1",
          meaningClear: true,
          target: "general",
          feedbackClaimCount: 0,
          remainingClaimCount: 0,
          harms: [{ type: "mockery", target: "general", severity: "low", criticalHarm: false }],
          confidence: 0.91,
          criticalHarm: false,
          harmSeverity: "low",
          otherTargetHarm: true,
          spamSignals: [],
          rewriteStatus: "not_required",
        },
      },
      replies: [],
      replyCount: 0,
    });
    expect(screen.getByText("크리에이터 대상 공격은 없지만 공격 표현이 있어 원문을 보호합니다.")).toBeVisible();
  });
  it("shows a risk author's profile while protecting the source and keeping its warning", () => {
    renderInbox({ reviewLevel: "risk", authorDisplayName: "위험 작성자", authorAvatarUrl: "https://example.com/risk.jpg", safeSourceText: "유해 원문" });
    expect(screen.getByText("위험 작성자")).toBeVisible();
    expect(screen.getByAltText("위험 작성자 프로필")).toHaveAttribute("src", "https://example.com/risk.jpg");
    expect(screen.queryByText("유해 원문")).not.toBeInTheDocument();
    expect(screen.queryByText("보호된 작성자")).not.toBeInTheDocument();
    expect(screen.getByText("위험 댓글 · 내용 보호됨")).toBeVisible();
  });
  it("keeps protected replies collapsed and never includes caution raw text", () => {
    renderInbox();
    const disclosure = screen.getByText("답글 보기 (3)");
    expect(disclosure.closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByText("주의 답글 원문")).not.toBeInTheDocument();
    expect(screen.getByText("보호 대상 시청자")).toBeInTheDocument();
    expect(screen.getByText("같은 개선 요청")).toBeInTheDocument();
  });
  it.each(["risk", null] as const)("shows comment and reply profiles for level %s without exposing raw text", (reviewLevel) => {
    renderInbox({
      reviewLevel,
      authorDisplayName: "댓글 게시자",
      authorAvatarUrl: "https://example.com/author.jpg",
      safeSourceText: "숨겨야 하는 원문",
      replies: [{ ...item.replies[2], reviewLevel, authorDisplayName: "답글 게시자", authorAvatarUrl: "https://example.com/reply.jpg" }],
      replyCount: 1,
    }, true);
    expect(screen.getByText("댓글 게시자")).toBeVisible();
    expect(screen.getByAltText("댓글 게시자 프로필")).toHaveAttribute("src", "https://example.com/author.jpg");
    expect(screen.getByText("답글 게시자")).toBeVisible();
    expect(screen.getByAltText("답글 게시자 프로필")).toHaveAttribute("src", "https://example.com/reply.jpg");
    expect(screen.queryByText("숨겨야 하는 원문")).not.toBeInTheDocument();
  });
  it("does not offer a reply composer or nonfunctional reactions", () => {
    renderInbox({ replies: [], replyCount: 0 });
    expect(screen.getByText("답글 0개")).toBeVisible();
    expect(screen.queryByText(/답글 보기/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /좋아요|싫어요|답글 보내기/ })).not.toBeInTheDocument();
  });
  it("uses the source's real video and author assets", () => {
    renderInbox({ authorAvatarUrl: "https://example.com/profile.jpg", videoThumbnailUrl: "https://i.ytimg.com/vi/video-1/default.jpg" });
    expect(screen.getByAltText("시청자 프로필")).toHaveAttribute("src", "https://example.com/profile.jpg");
    expect(screen.getByRole("link", { name: "새 영상 YouTube에서 보기" })).toHaveAttribute("href", "https://www.youtube.com/watch?v=video-1");
    expect(screen.getByAltText("새 영상 썸네일")).toHaveAttribute("src", "https://i.ytimg.com/vi/video-1/default.jpg");
  });
  it("does not invent a thumbnail when none was imported", () => {
    renderInbox();
    expect(screen.queryByAltText("새 영상 썸네일")).not.toBeInTheDocument();
  });
  it("preserves review and correction controls under the comment menu", () => {
    renderInbox({ classificationTrace: certaintyTrace }, true);
    expect(screen.getByText("댓글 검토")).toBeVisible();
    expect(screen.getByText("높음 · clear")).toBeVisible();
    expect(screen.getByText("시프티와 다르게 분류하기")).toBeVisible();
    expect(screen.getByRole("button", { name: "검토 대기로 이동" })).toBeVisible();
  });
  it("offers the four compact correction outcomes beside the video", () => {
    renderInbox({ classificationTrace: certaintyTrace });
    const form = screen.getByRole("form", { name: "시프티와 다르게 분류하기" });
    const controls = within(form);
    expect(controls.getByRole("button", { name: "안전" })).toBeVisible();
    expect(controls.getByRole("button", { name: "주의" })).toBeVisible();
    expect(controls.getByRole("button", { name: "위험" })).toBeVisible();
    expect(controls.getByRole("button", { name: "판단 보류" })).toBeVisible();
    expect(controls.getByText("이유 적기")).toBeVisible();
    expect(controls.queryByText("댓글 유형", { selector: "label span" })).not.toBeInTheDocument();
  });
  it("allows an unresolved classification to stay explicitly on hold", () => {
    renderInbox({ reviewLevel: null, classificationStatus: "review_queue", classificationTrace: certaintyTrace });
    expect(screen.getByText("판단 보류 · 내용 보호됨")).toBeVisible();
    const form = screen.getByRole("form", { name: "시프티와 다르게 분류하기" });
    expect(within(form).getByRole("button", { name: "판단 보류" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("retains the warning when AI finds new risk after a creator correction", () => {
    renderInbox({ reviewLevel: "caution", aiReviewLevel: "risk" }, true);
    expect(screen.getByText("다시 분석했을 때 위험으로 나왔습니다")).toBeVisible();
  });
  it("does not ask to allow channel expressions before opening the source", () => {
    renderInbox();
    expect(screen.queryByText(/우리 채널.*칭찬/)).not.toBeInTheDocument();
  });
  it.each([
    ["published", "게시 승인"], ["heldForReview", "검토 대기로 이동"], ["rejected", "거절하여 숨기기"],
  ] as const)("omits the no-op moderation action for %s", (status, absent) => {
    renderInbox({ sourceModerationStatus: status }, true);
    expect(screen.queryByRole("button", { name: absent })).not.toBeInTheDocument();
    expect(screen.getByLabelText("YouTube 댓글 조치").querySelectorAll("form")).toHaveLength(2);
  });
  it("only offers permanent deletion when server eligibility permits it", () => {
    const view = renderInbox({}, true);
    expect(screen.queryByRole("button", { name: "내 댓글 영구 삭제" })).not.toBeInTheDocument();
    view.unmount();
    renderInbox({ deleteEligible: true }, true);
    const button = screen.getByRole("button", { name: "내 댓글 영구 삭제" });
    expect(button).toHaveAttribute("value", "delete");
    expect(button.closest("form")).toHaveFormValues({ rawCommentId: item.rawCommentId, sourceImportJobId: item.sourceImportJobId });
  });
  it("keeps public comments read-only without personalization or moderation", () => {
    renderInbox({ sourceKind: "public_url", deleteEligible: true }, true);
    expect(screen.getByText("공개 URL · 읽기 전용")).toBeVisible();
    expect(screen.queryByRole("button", { name: "내 댓글 영구 삭제" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("YouTube 댓글 조치")).not.toBeInTheDocument();
    expect(screen.queryByText("내 기준 개인화에 사용")).not.toBeInTheDocument();
    expect(screen.getByText("시프티와 다르게 분류하기")).toBeVisible();
    expect(screen.getByRole("form", { name: "시프티와 다르게 분류하기" })).toHaveFormValues({
      useForPersonalization: "false",
    });
  });
  it("keeps filters and sorting in pagination links", () => {
    render(<CommentInbox correctionAction={vi.fn()} moderationAction={vi.fn()} data={{ items: [item], total: 70 }} filters={{ reviewLevels: ["risk"], videoIds: ["one", "two"], period: "30d", sort: "likes", search: "편집", limit: 25, offset: 25 }} videos={[]} />);
    const href = screen.getByRole("link", { name: "다음 페이지" }).getAttribute("href")!;
    const params = new URL(href, "http://localhost").searchParams;
    expect(params.getAll("video")).toEqual(["one", "two"]);
    expect(params.get("period")).toBe("30d");
    expect(params.get("sort")).toBe("likes");
    expect(params.get("page")).toBe("3");
    expect(params.get("levels")).toBe("risk");
  });
  it("shows a real empty state instead of mock metrics", () => {
    render(<CommentInbox correctionAction={vi.fn()} moderationAction={vi.fn()} data={{ items: [], total: 0 }} filters={{ reviewLevels: ["safe", "caution", "risk"] }} videos={[]} />);
    expect(screen.getByRole("heading", { name: "현재 조건에 맞는 댓글이 없습니다" })).toBeVisible();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
});
