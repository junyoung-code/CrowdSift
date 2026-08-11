import { render, screen, within } from "@testing-library/react";
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
  classificationTrace: null,
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
      allowExpressionAction={vi.fn()}
      correctionAction={vi.fn()}
      moderationAction={vi.fn()}
      data={{ items: [inboxItem], total: 1 }}
      filters={{ reviewLevels }}
      videos={[{ id: "video-1", title: "새 영상" }]}
    />,
  );

describe("allowing a channel expression", () => {
  // 주의 댓글의 원문은 목록 데이터에 실려 오지 않는다. 그래서 등록 폼은 원문을
  // 펼친 뒤에야 나오고, 여기서는 물어볼 자격이 있는 댓글인지까지만 본다.
  it("never asks before the creator has opened the source", () => {
    renderInbox(item);

    expect(
      screen.queryByRole("button", { name: "칭찬으로 등록" }),
    ).not.toBeInTheDocument();
  });
});

describe("CommentInbox", () => {
  it("hides caution source text and shows the feedback core in the queue", () => {
    render(
      <CommentInbox
        allowExpressionAction={vi.fn()}
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
      screen.queryByText("주의 댓글 원문", {
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
      screen.queryByText("주의 댓글 원문", {
        selector: ".comment-source-text",
      }),
    ).not.toBeInTheDocument();
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
      screen.getAllByRole("img", { name: "새 영상 썸네일" }),
    ).not.toHaveLength(0);
  });

  it("shows connected queue context without inventing metadata", () => {
    renderInbox({
      ...item,
      category: "constructive_feedback",
      videoThumbnailUrl: "https://example.com/video.jpg",
    });

    expect(
      screen.getAllByText("시프티가 찾은 긍정적 피드백"),
    ).not.toHaveLength(0);
    expect(
      screen.getAllByRole("img", { name: "시프티 프로필" }),
    ).not.toHaveLength(0);
    expect(screen.getAllByText("새 영상").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByRole("img", { name: "새 영상 썸네일" }),
    ).toHaveLength(2);
    expect(screen.getByText("답글 3개", { selector: "span" })).toBeInTheDocument();
  });

  it("shows Shifty in the queue risk context and keeps the primary conversation badge", () => {
    const { container } = renderInbox({
      ...item,
      category: "abusive_no_signal",
      reviewLevel: "risk",
    });

    expect(
      container.querySelector(".inbox-queue-context-risk .inbox-shifty-avatar"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".inbox-thread-author .review-level-risk svg"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "댓글 대화" })).getByRole(
        "img",
        { name: "시프티 프로필" },
      ),
    ).toBeInTheDocument();
  });

  it("shows the review level once in a queue item", () => {
    const { container } = renderInbox({
      ...item,
      category: "abusive_no_signal",
      reviewLevel: "risk",
    });

    expect(
      container.querySelector(".inbox-queue-item .review-level"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".inbox-queue-item .inbox-queue-context-risk"),
    ).toHaveTextContent("위험 댓글 · 내용 보호됨");
  });

  it("uses a role label instead of repeating the risk state in the conversation card", () => {
    renderInbox({
      ...item,
      category: "abusive_no_signal",
      reviewLevel: "risk",
    });

    const conversation = screen.getByRole("region", { name: "댓글 대화" });

    expect(
      within(conversation).getByText("시프티 분석 결과"),
    ).toBeInTheDocument();
    expect(
      within(conversation).queryByText("위험 댓글 · 내용 보호됨"),
    ).not.toBeInTheDocument();
  });

  it("uses Shifty's safe message instead of the uncertain label", () => {
    const { container } = renderInbox(
      {
        ...item,
        reviewLevel: "safe",
        category: "uncertain",
        safeSourceText: "편집 스타일은 취향에 따라 다를 수 있어요.",
      },
      ["safe"],
    );

    expect(
      screen.getAllByText("시프티가 보기에 안전해요!"),
    ).not.toHaveLength(0);
    expect(
      container.querySelector(".inbox-queue-context-safe .inbox-shifty-avatar"),
    ).toBeInTheDocument();
    expect(screen.queryByText("판단 어려움")).not.toBeInTheDocument();
  });

  it("does not render a reply disclosure when there are no stored replies", () => {
    renderInbox({ ...item, replyCount: 0, replies: [] });

    expect(
      screen.queryByRole("link", { name: "답글 0개 보기" }),
    ).not.toBeInTheDocument();
  });

  it("shows recent comment time relatively", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00.000Z"));

    renderInbox({
      ...item,
      publishedAt: "2026-08-07T11:55:00.000Z",
    });

    expect(screen.getAllByText("5분 전")).not.toHaveLength(0);
  });

  it("shows categorical certainty from the verification trace", () => {
    renderInbox({
      ...item,
      classificationTrace: certaintyTrace,
      confidence: 0.82,
    });

    expect(screen.getByText("확실성", { selector: "dt" })).toBeInTheDocument();
    expect(
      screen.getByText("높음 · clear", { selector: "dd" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("82%", { selector: "dd" })).not.toBeInTheDocument();
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

  it("requires acknowledgment before showing caution source", () => {
    const { container } = renderInbox({
      ...item,
      safeSourceText: "주의 댓글 원문",
    });

    expect(
      screen.queryByText("주의 댓글 원문", {
        selector: ".comment-source-text",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "원문 확인" }),
    ).toBeInTheDocument();

    const warningRow = screen
      .getByText("원문에는 거친 표현이 포함될 수 있습니다.")
      .closest(".inbox-source-warning-row");

    expect(warningRow).toBeInTheDocument();
    expect(
      within(warningRow as HTMLElement).getByRole("button", {
        name: "원문 확인",
      }),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".inbox-protected-source-caution"),
    ).toBeInTheDocument();
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
        allowExpressionAction={vi.fn()}
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
        allowExpressionAction={vi.fn()}
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
        allowExpressionAction={vi.fn()}
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
        allowExpressionAction={vi.fn()}
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
        allowExpressionAction={vi.fn()}
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
