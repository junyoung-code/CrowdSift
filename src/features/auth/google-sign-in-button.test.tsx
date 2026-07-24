import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSignInWithOAuth } = vi.hoisted(() => ({
  mockSignInWithOAuth: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: vi.fn(() => ({
    auth: {
      signInWithOAuth: mockSignInWithOAuth,
    },
  })),
}));

import { GoogleSignInButton } from "./google-sign-in-button";

describe("GoogleSignInButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithOAuth.mockResolvedValue({ error: null });
  });

  it("starts only the Google login flow with an internal callback", async () => {
    const user = userEvent.setup();
    render(<GoogleSignInButton nextPath="/app/inbox" />);

    await user.click(
      screen.getByRole("button", { name: "Google로 계속하기" }),
    );

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo:
          "http://localhost:3000/auth/callback?next=%2Fapp%2Finbox",
      },
    });
  });

  it("shows a retryable error without provider details", async () => {
    const user = userEvent.setup();
    mockSignInWithOAuth.mockResolvedValue({
      error: { message: "secret provider response" },
    });
    render(<GoogleSignInButton nextPath="/app" />);

    await user.click(
      screen.getByRole("button", { name: "Google로 계속하기" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Google 로그인을 시작하지 못했습니다",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "secret provider response",
    );
    expect(
      screen.getByRole("button", { name: "Google로 계속하기" }),
    ).toBeEnabled();
  });
});
