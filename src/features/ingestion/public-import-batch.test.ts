import { describe, expect, it, vi } from "vitest";
import { fetchPublicImportBatch, publicImportCursorSchema } from "./public-import-batch";
import type { ProviderComment } from "./comment-mapper";
const comment = (id: string): ProviderComment => ({ id, parentId: null, textDisplay: id, authorChannelId: null, authorDisplayName: null, authorAvatarUrl: null, likeCount: 0, moderationStatus: null, publishedAt: null, updatedAt: null, rawPayload: {} });
describe("durable public import cursor", () => {
  it("resumes reply pages before advancing to the next thread page", async () => {
    const provider = {
      getPublicVideo: vi.fn(),
      listCommentThreads: vi.fn().mockResolvedValue({ items: [{ topLevelComment: comment("parent"), inlineReplies: [comment("reply-0")], totalReplyCount: 102 }], nextPageToken: "threads-2", quotaUnitsUsed: 1 }),
      listReplies: vi.fn().mockResolvedValueOnce({ items: [comment("reply-0"), comment("reply-1")], nextPageToken: "replies-2", quotaUnitsUsed: 1 }).mockResolvedValueOnce({ items: [comment("reply-2")], nextPageToken: null, quotaUnitsUsed: 1 }),
    };
    const first = await fetchPublicImportBatch(provider, "video", publicImportCursorSchema.parse({}));
    expect(first.comments.map(c => c.youtubeCommentId)).toEqual(["parent", "reply-0"]);
    // Simulate a process restart: only the serialized cursor survives.
    const second = await fetchPublicImportBatch(provider, "video", publicImportCursorSchema.parse(JSON.parse(JSON.stringify(first.cursor))));
    expect(second.cursor.replies[0].pageToken).toBe("replies-2");
    const third = await fetchPublicImportBatch(provider, "video", second.cursor);
    expect(third.cursor).toMatchObject({ threadPageToken: "threads-2", replies: [], done: false });
    await fetchPublicImportBatch(provider, "video", third.cursor);
    expect(provider.listCommentThreads).toHaveBeenLastCalledWith(expect.objectContaining({ pageToken: "threads-2" }));
    expect(provider.listReplies).toHaveBeenLastCalledWith(expect.objectContaining({ parentCommentId: "parent", pageToken: "replies-2" }));
  });
  it("does not advance the caller's cursor when the provider fails", async () => {
    const cursor = publicImportCursorSchema.parse({ threadPageToken: "saved-page" });
    const provider = { getPublicVideo: vi.fn(), listReplies: vi.fn(), listCommentThreads: vi.fn().mockRejectedValue(new Error("temporary")) };
    await expect(fetchPublicImportBatch(provider, "video", cursor)).rejects.toThrow("temporary");
    expect(cursor.threadPageToken).toBe("saved-page");
    expect(cursor.done).toBe(false);
  });
  it("stops without provider calls after the final committed page", async () => {
    const provider = { getPublicVideo: vi.fn(), listReplies: vi.fn(), listCommentThreads: vi.fn() };
    expect((await fetchPublicImportBatch(provider, "video", publicImportCursorSchema.parse({ done: true }))).comments).toEqual([]);
    expect(provider.listCommentThreads).not.toHaveBeenCalled();
  });
});
