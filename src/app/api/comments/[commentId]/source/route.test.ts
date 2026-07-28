import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireViewer, mockRpc } = vi.hoisted(() => ({
  mockRequireViewer: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock("@/features/auth/require-viewer", () => ({
  requireViewer: mockRequireViewer,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    rpc: mockRpc,
  })),
}));

import { POST } from "./route";

const sourceRow = {
  author_display_name: "테스트 작성자",
  author_avatar_url: null,
  published_at: "2026-07-23T00:00:00.000Z",
  text_display: "표시 원문",
  captured_at: "2026-07-23T00:01:00.000Z",
};

const requestSource = (acknowledged: boolean) =>
  POST(
    new Request("http://localhost:3000/api/comments/comment-1/source", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acknowledged }),
    }),
    { params: Promise.resolve({ commentId: "comment-1" }) },
  );

describe("POST /api/comments/[commentId]/source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireViewer.mockResolvedValue({
      userId: "user-1",
      workspaceId: "workspace-1",
    });
    mockRpc.mockResolvedValue({ data: [sourceRow], error: null });
  });

  it("loads acknowledged source through the protected RPC", async () => {
    const response = await requestSource(true);

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith(
      "get_acknowledged_comment_source",
      {
        target_raw_comment_id: "comment-1",
        target_workspace_id: "workspace-1",
      },
    );
    expect(await response.json()).toEqual({
      authorDisplayName: "테스트 작성자",
      authorAvatarUrl: null,
      publishedAt: "2026-07-23T00:00:00.000Z",
      textDisplay: "표시 원문",
      capturedAt: "2026-07-23T00:01:00.000Z",
    });
  });

  it("requires acknowledgement before querying source", async () => {
    const response = await requestSource(false);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "source_acknowledgement_required",
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns not found when the RPC cannot see a source row", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const response = await requestSource(true);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "source_not_found" });
  });

  it("does not expose database permission messages", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "workspace access denied: secret source payload",
      },
    });

    const response = await requestSource(true);
    const payload = await response.text();

    expect(response.status).toBe(500);
    expect(payload).toContain("source_request_failed");
    expect(payload).not.toContain("workspace access denied");
    expect(payload).not.toContain("secret source payload");
  });
});
