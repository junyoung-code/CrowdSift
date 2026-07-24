import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExchangeCodeForSession = vi.fn();

vi.mock("@/lib/env", () => ({
  getServerEnv: vi.fn(() => ({
    APP_ORIGIN: "http://localhost:3000",
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  })),
}));

import { GET } from "./route";

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it("exchanges a valid code behind a proxy and redirects to APP_ORIGIN", async () => {
    const response = await GET(
      new Request(
        "http://127.0.0.1:3000/auth/callback?code=valid-code&next=/app",
      ),
    );

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("valid-code");
    expect(response.headers.get("location")).toBe("http://localhost:3000/app");
  });

  it("rejects an external next target while keeping the configured origin", async () => {
    const response = await GET(
      new Request(
        "http://127.0.0.1:3000/auth/callback?code=valid-code&next=//evil.example",
      ),
    );

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("valid-code");
    expect(response.headers.get("location")).toBe("http://localhost:3000/app");
  });

  it.each([
    "/%5Cevil.example",
    "/%5cevil.example",
    "/%5C%5Cevil.example",
  ])("rejects a backslash-based next target: %s", async (next) => {
    const response = await GET(
      new Request(
        `http://127.0.0.1:3000/auth/callback?code=valid-code&next=${next}`,
      ),
    );

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("valid-code");
    expect(response.headers.get("location")).toBe("http://localhost:3000/app");
  });
});
