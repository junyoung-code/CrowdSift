import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SourceReveal } from "./source-reveal";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SourceReveal", () => {
  it("does not render harmful source before confirmation", () => {
    render(<SourceReveal commentId="comment-1" />);

    expect(screen.queryByText("source harmful text")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "원문 확인" }),
    ).toBeInTheDocument();
  });

  it("moves focus into the warning and restores it when Escape closes", async () => {
    const user = userEvent.setup();
    render(<SourceReveal commentId="comment-1" />);

    const revealButton = screen.getByRole("button", { name: "원문 확인" });
    await user.click(revealButton);

    expect(
      screen.getByRole("button", { name: "경고를 확인하고 원문 보기" }),
    ).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(revealButton).toHaveFocus();
  });

  it("requests source only after the warning is acknowledged", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        authorDisplayName: "테스트 작성자",
        authorAvatarUrl: null,
        publishedAt: "2026-07-23T00:00:00.000Z",
        textDisplay: "source harmful text",
        capturedAt: "2026-07-23T00:01:00.000Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SourceReveal commentId="comment-1" />);

    await user.click(screen.getByRole("button", { name: "원문 확인" }));
    expect(
      screen.getByText("유해한 표현이 포함될 수 있습니다"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "경고를 확인하고 원문 보기" }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/comments/comment-1/source",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ acknowledged: true }),
      }),
    );
    expect(await screen.findByText("source harmful text")).toBeInTheDocument();
    expect(screen.getByText("테스트 작성자")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "원문 접기" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "원문 접기" }));

    expect(screen.queryByText("source harmful text")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "원문 확인" }),
    ).toBeInTheDocument();
  });

  it("asks about a channel expression only once the source is on screen", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          authorDisplayName: "테스트 작성자",
          authorAvatarUrl: null,
          publishedAt: "2026-07-23T00:00:00.000Z",
          textDisplay: "님 진짜 ㅈㄴ웃기네요 ㅋㅋㅋㅋ 구독합니다",
          capturedAt: "2026-07-23T00:01:00.000Z",
        }),
      }),
    );

    render(
      <SourceReveal allowExpressionAction={vi.fn()} commentId="comment-1" />,
    );

    // 무엇을 풀어 주는지 읽지도 않은 채 등록하게 두어서는 안 된다.
    expect(
      screen.queryByRole("button", { name: "칭찬으로 등록" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "원문 확인" }));
    await user.click(
      screen.getByRole("button", { name: "경고를 확인하고 원문 보기" }),
    );

    expect(
      await screen.findByRole("textbox", { name: "허용할 표현" }),
    ).toHaveValue("ㅈㄴ웃기네요");
  });

  it("keeps quiet on a comment the channel may not learn from", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          authorDisplayName: "테스트 작성자",
          authorAvatarUrl: null,
          publishedAt: "2026-07-23T00:00:00.000Z",
          textDisplay: "님 진짜 ㅈㄴ웃기네요 ㅋㅋㅋㅋ 구독합니다",
          capturedAt: "2026-07-23T00:01:00.000Z",
        }),
      }),
    );

    render(<SourceReveal commentId="comment-1" />);

    await user.click(screen.getByRole("button", { name: "원문 확인" }));
    await user.click(
      screen.getByRole("button", { name: "경고를 확인하고 원문 보기" }),
    );
    expect(
      await screen.findByText("님 진짜 ㅈㄴ웃기네요 ㅋㅋㅋㅋ 구독합니다"),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "칭찬으로 등록" }),
    ).not.toBeInTheDocument();
  });

  it("drops a revealed source when the comment changes", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          authorDisplayName: "첫 번째 작성자",
          authorAvatarUrl: null,
          publishedAt: "2026-07-23T00:00:00.000Z",
          textDisplay: "첫 번째 댓글 원문",
          capturedAt: "2026-07-23T00:01:00.000Z",
        }),
      }),
    );

    const { rerender } = render(<SourceReveal commentId="comment-1" />);

    await user.click(screen.getByRole("button", { name: "원문 확인" }));
    await user.click(
      screen.getByRole("button", { name: "경고를 확인하고 원문 보기" }),
    );
    expect(await screen.findByText("첫 번째 댓글 원문")).toBeInTheDocument();

    // Selecting another comment must not leave the previous source on screen, or the
    // reader would weigh one comment's words against another comment's controls.
    rerender(<SourceReveal commentId="comment-2" />);

    expect(screen.queryByText("첫 번째 댓글 원문")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "원문 확인" }),
    ).toBeInTheDocument();
  });

  it("keeps the sanitized summary visible after revealing source", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          authorDisplayName: "테스트 작성자",
          authorAvatarUrl: null,
          publishedAt: "2026-07-23T00:00:00.000Z",
          textDisplay: "원문에만 있는 표현",
          capturedAt: "2026-07-23T00:01:00.000Z",
        }),
      }),
    );

    render(
      <div>
        <p>순화된 요약</p>
        <SourceReveal commentId="comment-1" />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "원문 확인" }));
    await user.click(
      screen.getByRole("button", { name: "경고를 확인하고 원문 보기" }),
    );

    expect(await screen.findByText("원문에만 있는 표현")).toBeInTheDocument();
    expect(screen.getByText("순화된 요약")).toBeInTheDocument();
  });

  it("offers a retry after a transient source failure", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          authorDisplayName: null,
          authorAvatarUrl: null,
          publishedAt: null,
          textDisplay: "재시도 후 원문",
          capturedAt: "2026-07-23T00:01:00.000Z",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<SourceReveal commentId="comment-1" />);

    await user.click(screen.getByRole("button", { name: "원문 확인" }));
    await user.click(
      screen.getByRole("button", { name: "경고를 확인하고 원문 보기" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "원문을 불러오지 못했습니다",
    );
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText("재시도 후 원문")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
