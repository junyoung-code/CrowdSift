import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CommentSourceBlock } from "./comment-source-block";

describe("CommentSourceBlock", () => {
  it("shows the source author, published time, and preserved line breaks", () => {
    render(
      <CommentSourceBlock
        authorAvatarUrl="https://example.test/avatar.png"
        authorDisplayName="댓글 작성자"
        publishedAt="2026-07-23T00:00:00.000Z"
        textDisplay={"첫 줄\n둘째 줄"}
      />,
    );

    expect(
      screen.getByRole("img", { name: "댓글 작성자 프로필" }),
    ).toHaveAttribute("src", "https://example.test/avatar.png");
    expect(screen.getByText("댓글 작성자")).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    expect(screen.getByText(/첫 줄/)).toHaveTextContent("첫 줄 둘째 줄");
    expect(screen.queryByText("확인한 원문")).not.toBeInTheDocument();
  });

  it("marks acknowledged protected source and shows captured time", () => {
    render(
      <CommentSourceBlock
        authorAvatarUrl={null}
        authorDisplayName={null}
        capturedAt="2026-07-23T00:01:00.000Z"
        protectedSource
        publishedAt={null}
        textDisplay="확인한 원문 내용"
      />,
    );

    expect(screen.getByText("확인한 원문")).toBeInTheDocument();
    expect(screen.getByText("이름 없는 시청자")).toBeInTheDocument();
    expect(screen.getByText(/수집 시각/)).toBeInTheDocument();
  });
});
