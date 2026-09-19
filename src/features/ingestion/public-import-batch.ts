import { z } from "zod";
import type { PublicYouTubeReadProvider } from "@/features/youtube/public-read-contracts";
import { mapProviderComment, type SourceComment } from "./comment-mapper";

export const publicImportCursorSchema = z.object({
  threadPageToken: z.string().nullable().default(null),
  threadsDone: z.boolean().default(false),
  replies: z.array(z.object({ parentId: z.string(), pageToken: z.string().nullable() })).default([]),
  done: z.boolean().default(false),
});
export type PublicImportCursor = z.infer<typeof publicImportCursorSchema>;

/** One YouTube page per step. Cursor is committed together with its source comments. */
export async function fetchPublicImportBatch(provider: PublicYouTubeReadProvider, videoId: string, cursor: PublicImportCursor) {
  if (cursor.done) return { comments: [] as SourceComment[], cursor, quota: 0 };
  const reply = cursor.replies[0];
  if (reply) {
    const page = await provider.listReplies({ parentCommentId: reply.parentId, pageToken: reply.pageToken, maxResults: 100 });
    const replies = page.nextPageToken
      ? [{ ...reply, pageToken: page.nextPageToken }, ...cursor.replies.slice(1)]
      : cursor.replies.slice(1);
    return {
      comments: page.items.map(comment => mapProviderComment({ ...comment, parentId: reply.parentId })),
      cursor: { ...cursor, replies, done: cursor.threadsDone && replies.length === 0 },
      quota: page.quotaUnitsUsed,
    };
  }
  const page = await provider.listCommentThreads({ videoId, pageToken: cursor.threadPageToken, maxResults: 100, order: "time" });
  const comments: SourceComment[] = [];
  const replies: PublicImportCursor["replies"] = [];
  for (const thread of page.items) {
    const parentId = thread.topLevelComment.id;
    comments.push(mapProviderComment({ ...thread.topLevelComment, parentId: null }));
    comments.push(...thread.inlineReplies.map(reply => mapProviderComment({ ...reply, parentId })));
    if (thread.totalReplyCount > thread.inlineReplies.length) replies.push({ parentId, pageToken: null });
  }
  const threadsDone = !page.nextPageToken;
  return { comments, cursor: { threadPageToken: page.nextPageToken, threadsDone, replies, done: threadsDone && replies.length === 0 }, quota: page.quotaUnitsUsed };
}
