import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetUser, mockRedirect, mockRpc } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw {
      digest: `NEXT_REDIRECT;replace;${path};307;`,
    };
  }),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    rpc: mockRpc,
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

import { requireViewer } from "./require-viewer";

describe("requireViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated viewers to sign-in", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(requireViewer()).rejects.toMatchObject({
      digest: expect.stringContaining("/auth/sign-in"),
    });
  });

  it("creates the owner workspace once after first authentication", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: "workspace-1",
      error: null,
    });

    await expect(requireViewer()).resolves.toEqual({
      userId: "user-1",
      workspaceId: "workspace-1",
    });
    expect(mockRpc).toHaveBeenCalledWith("ensure_owner_workspace");
  });
});
