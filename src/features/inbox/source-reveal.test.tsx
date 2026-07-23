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

  it("requests source only after the warning is acknowledged", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        textDisplay: "source harmful text",
        textOriginal: null,
        capturedAt: "2026-07-23T00:00:00.000Z",
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
  });
});
