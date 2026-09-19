import { createHash } from "node:crypto";
import { z } from "zod";

export const PublicCommentFixtureSchema = z.object({
  schemaVersion: z.literal("public-comment-fixture-v1"),
  source: z.literal("youtube-public-api"),
  capturedAt: z.iso.datetime(),
  sampling: z.string(),
  videos: z.array(z.object({
    videoId: z.string(),
    canonicalUrl: z.url(),
    title: z.string(),
    channelId: z.string(),
    channelTitle: z.string(),
    commentCount: z.number().nullable(),
    requestedCount: z.number().int().positive(),
    topLevelCount: z.number().int().nonnegative(),
    replyCount: z.number().int().nonnegative(),
  })).min(1),
  comments: z.array(z.object({
    id: z.string().min(1),
    videoId: z.string(),
    parentId: z.string().nullable(),
    sourceText: z.string().min(1),
    publishedAt: z.string().nullable(),
    likeCount: z.number(),
    // Original provider payload is preserved separately from analysis results.
    raw: z.unknown(),
  })).min(1),
}).superRefine((dataset, context) => {
  const videos = new Set(dataset.videos.map((video) => video.videoId));
  const comments = new Map(dataset.comments.map((comment) => [comment.id, comment]));
  if (comments.size !== dataset.comments.length) {
    context.addIssue({ code: "custom", message: "Duplicate comment IDs" });
  }
  for (const comment of dataset.comments) {
    if (!videos.has(comment.videoId)) {
      context.addIssue({ code: "custom", message: "Missing source video" });
    }
    if (comment.parentId) {
      const parent = comments.get(comment.parentId);
      if (!parent || parent.videoId !== comment.videoId || parent.parentId !== null) {
        context.addIssue({ code: "custom", message: "Missing or invalid parent context" });
      }
    }
  }
  for (const video of dataset.videos) {
    const selected = dataset.comments.filter((comment) => comment.videoId === video.videoId);
    if (selected.length !== video.topLevelCount + video.replyCount ||
        selected.filter((comment) => comment.parentId === null).length !== video.topLevelCount ||
        selected.length > video.requestedCount) {
      context.addIssue({ code: "custom", message: "Incorrect collection counts" });
    }
  }
});

export type PublicCommentFixture = z.infer<typeof PublicCommentFixtureSchema>;
export const fixtureHash = (fixture: PublicCommentFixture) =>
  createHash("sha256").update(JSON.stringify(fixture)).digest("hex");
