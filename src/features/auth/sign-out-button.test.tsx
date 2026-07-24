import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRefresh, mockReplace, mockSignOut } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockReplace: vi.fn(),
  mockSignOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
    replace: mockReplace,
  }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: vi.fn(() => ({
    auth: {
      signOut: mockSignOut,
    },
  })),
}));

import { SignOutButton } from "./sign-out-button";

describe("SignOutButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue({ error: null });
  });

  it("clears the Supabase session and returns to sign-in", async () => {
    const user = userEvent.setup();
    render(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: "로그아웃" }));

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/auth/sign-in");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("keeps a retryable control when sign-out fails", async () => {
    const user = userEvent.setup();
    mockSignOut.mockResolvedValue({
      error: { message: "refresh token secret" },
    });
    render(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: "로그아웃" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "로그아웃하지 못했습니다",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "refresh token secret",
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeEnabled();
  });
});
