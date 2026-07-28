import { describe, expect, it, vi } from "vitest";

import { previewPublicVideo } from "./public-preview-service";

const VIDEO_ID = "dQw4w9WgXcQ";

describe("previewPublicVideo", () => {
  it("authenticates, validates development mode, and returns metadata without persistence", async () => {
    const assertAuthenticatedWorkspace = vi
      .fn()
      .mockResolvedValue({ workspaceId: "workspace-1" });
    const assertDevelopmentMode = vi.fn();
    const getPublicVideo = vi.fn().mockResolvedValue({
      videoId: VIDEO_ID,
      canonicalUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      title: "Public test video",
      channelId: "channel-1",
      channelTitle: "Creator",
      thumbnailUrl: null,
      commentsAvailable: true,
      commentCount: 10,
      quotaUnitsUsed: 1,
    });

    await expect(
      previewPublicVideo(
        { url: `https://youtu.be/${VIDEO_ID}` },
        {
          assertAuthenticatedWorkspace,
          assertDevelopmentMode,
          provider: {
            getPublicVideo,
            listCommentThreads: vi.fn(),
            listReplies: vi.fn(),
          },
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        videoId: VIDEO_ID,
        canonicalUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      }),
    );
    expect(assertAuthenticatedWorkspace).toHaveBeenCalledOnce();
    expect(assertDevelopmentMode).toHaveBeenCalledOnce();
    expect(getPublicVideo).toHaveBeenCalledWith(VIDEO_ID);
  });

  it("does not call YouTube when the workspace check fails", async () => {
    const getPublicVideo = vi.fn();

    await expect(
      previewPublicVideo(
        { url: `https://youtu.be/${VIDEO_ID}` },
        {
          assertAuthenticatedWorkspace: vi
            .fn()
            .mockRejectedValue(new Error("AUTH_REQUIRED")),
          assertDevelopmentMode: vi.fn(),
          provider: {
            getPublicVideo,
            listCommentThreads: vi.fn(),
            listReplies: vi.fn(),
          },
        },
      ),
    ).rejects.toThrow("AUTH_REQUIRED");
    expect(getPublicVideo).not.toHaveBeenCalled();
  });

  it("does not call YouTube when development mode is unavailable", async () => {
    const getPublicVideo = vi.fn();

    await expect(
      previewPublicVideo(
        { url: `https://youtu.be/${VIDEO_ID}` },
        {
          assertAuthenticatedWorkspace: vi.fn().mockResolvedValue({
            workspaceId: "workspace-1",
          }),
          assertDevelopmentMode: vi.fn(() => {
            throw new Error("PUBLIC_DEV_MODE_DISABLED");
          }),
          provider: {
            getPublicVideo,
            listCommentThreads: vi.fn(),
            listReplies: vi.fn(),
          },
        },
      ),
    ).rejects.toThrow("PUBLIC_DEV_MODE_DISABLED");
    expect(getPublicVideo).not.toHaveBeenCalled();
  });
});
