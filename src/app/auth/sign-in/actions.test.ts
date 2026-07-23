import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSignInWithOtp = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      signInWithOtp: mockSignInWithOtp,
    },
  })),
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: vi.fn(() => ({
    APP_ORIGIN: "https://commenthawk.example",
  })),
}));

import { requestMagicLink } from "./actions";

describe("requestMagicLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an invalid email before calling Supabase", async () => {
    const formData = new FormData();
    formData.set("email", "not-an-email");

    await expect(requestMagicLink(undefined, formData)).resolves.toEqual({
      status: "error",
      message: "올바른 이메일 주소를 입력해 주세요.",
    });
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("requests a magic link that returns to the internal auth callback", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });
    const formData = new FormData();
    formData.set("email", "creator@example.com");

    await expect(requestMagicLink(undefined, formData)).resolves.toEqual({
      status: "success",
      message: "로그인 링크를 이메일로 보냈습니다.",
    });
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: "creator@example.com",
      options: {
        emailRedirectTo:
          "https://commenthawk.example/auth/callback?next=/app",
      },
    });
  });
});
