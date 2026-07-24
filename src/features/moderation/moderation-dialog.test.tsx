import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ModerationDialog } from "./moderation-dialog";

const request = {
  requestId: "request-1",
  youtubeCommentId: "youtube-comment-1",
  action: "reject" as const,
  state: "pending_confirmation" as const,
};

describe("ModerationDialog", () => {
  it("requires an explicit checkbox before enabling execution", async () => {
    const user = userEvent.setup();
    render(
      <ModerationDialog
        confirmAction={vi.fn()}
        dismissHref="/app/inbox"
        request={request}
      />,
    );

    expect(
      screen.getByText("AI 추천이며 최종 실행은 본인 결정입니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("youtube-comment-1")).toBeInTheDocument();
    expect(
      screen.getByText("거절된 댓글의 답글도 함께 숨겨질 수 있습니다."),
    ).toBeInTheDocument();

    const checkbox = screen.getByRole("checkbox", {
      name: "조치 결과와 되돌림 제약을 이해했습니다",
    });
    const submit = screen.getByRole("button", {
      name: "확인하고 실행",
    });

    expect(submit).toBeDisabled();
    await user.click(checkbox);
    expect(submit).toBeEnabled();
  });

  it("shows a scope grant path without an execution button", () => {
    render(
      <ModerationDialog
        confirmAction={vi.fn()}
        dismissHref="/app/inbox"
        request={{
          ...request,
          state: "awaiting_scope",
        }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "YouTube 조치 권한 연결" }),
    ).toHaveAttribute(
      "href",
      "/api/youtube/oauth/moderation?requestId=request-1",
    );
    expect(
      screen.getByRole("heading", {
        name: "댓글 조치 권한이 추가로 필요합니다",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/youtube\.force-ssl/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "확인하고 실행" }),
    ).not.toBeInTheDocument();
  });

  it("states that permanent deletion is irreversible", () => {
    render(
      <ModerationDialog
        confirmAction={vi.fn()}
        dismissHref="/app/inbox"
        request={{
          ...request,
          action: "delete",
        }}
      />,
    );

    expect(
      screen.getByText(
        "내가 작성한 댓글을 YouTube에서 영구 삭제하며 되돌릴 수 없습니다.",
      ),
    ).toBeInTheDocument();
  });

  it("offers status reconciliation without describing a second provider action", () => {
    render(
      <ModerationDialog
        confirmAction={vi.fn()}
        dismissHref="/app/inbox"
        request={{
          ...request,
          state: "running",
        }}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "YouTube 처리 결과를 다시 확인하세요",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "처리 상태 다시 확인" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", {
        name: "조치 결과와 되돌림 제약을 이해했습니다",
      }),
    ).not.toBeInTheDocument();
  });
});
