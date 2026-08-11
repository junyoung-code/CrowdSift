import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServerEnv, notFound, requireViewer } = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  requireViewer: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/features/auth/require-viewer", () => ({ requireViewer }));
vi.mock("@/lib/env", () => ({ getServerEnv }));

import { requireDeveloperToolsViewer } from "./require-developer-tools-viewer";

describe("requireDeveloperToolsViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
    requireViewer.mockResolvedValue({ userId: "user-1", workspaceId: "ws-1" });
    getServerEnv.mockReturnValue({
      ENABLE_DEVELOPER_TOOLS: true,
      DEVELOPER_USER_IDS: "user-1,user-2",
    });
  });

  it("returns the authenticated viewer when the user is allowlisted", async () => {
    await expect(requireDeveloperToolsViewer()).resolves.toEqual({
      userId: "user-1",
      workspaceId: "ws-1",
    });
    expect(notFound).not.toHaveBeenCalled();
  });

  it("terminates the route when the user is not allowlisted", async () => {
    getServerEnv.mockReturnValue({
      ENABLE_DEVELOPER_TOOLS: true,
      DEVELOPER_USER_IDS: "user-2",
    });

    await expect(requireDeveloperToolsViewer()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });
});
