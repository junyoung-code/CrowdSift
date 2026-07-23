import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommentInbox } from "./comment-inbox";

const item = {
  rawCommentId: "comment-1",
  youtubeVideoId: "video-1",
  authorDisplayName: "시청자",
  authorAvatarUrl: null,
  publishedAt: "2026-07-23T00:00:00.000Z",
  sourceAvailable: true,
  analysisId: "analysis-1",
  category: "toxic_but_actionable" as const,
  reviewLevel: "caution" as const,
  confidence: 0.82,
  recommendedAction: "review" as const,
  manualReview: true,
  neutralText: "자막 크기를 키워 달라는 요청",
  normalizedQuestion: null,
  analysisState: "analyzed" as const,
  actionState: null,
};

describe("CommentInbox", () => {
  it("shows sanitized feedback and never embeds source text in the list", () => {
    render(
      <CommentInbox
        correctionAction={vi.fn()}
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

  it("explains why no numbers are shown when the queue is empty", () => {
    render(
      <CommentInbox
        correctionAction={vi.fn()}
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
});
