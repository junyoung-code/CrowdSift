import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./actions", () => ({
  requestMagicLink: vi.fn(async () => undefined),
}));

import SignInPage from "./page";

describe("SignInPage", () => {
  it("explains that CommentHawk login and YouTube access are separate", async () => {
    const page = await SignInPage({
      searchParams: Promise.resolve({}),
    });

    render(page);

    expect(
      screen.getByRole("heading", { name: "CommentHawk에 로그인" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("이메일")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "로그인 링크 받기" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/YouTube 채널 권한은 로그인 후 별도로 연결/),
    ).toBeInTheDocument();
  });
});
