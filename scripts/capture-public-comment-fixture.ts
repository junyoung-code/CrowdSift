/** NODE_OPTIONS=--conditions=react-server npx tsx scripts/capture-public-comment-fixture.ts output.json VIDEO_ID... */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvConfig } from "@next/env";

import { collectPublicComments } from "../src/features/ingestion/public-comment-collector";
import { GooglePublicYouTubeReadProvider } from "../src/features/youtube/google-public-read-provider";
import { PublicCommentFixtureSchema, type PublicCommentFixture } from "./public-comment-fixture";

async function main() {
  loadEnvConfig(process.cwd(), true);
  const [output, ...args] = process.argv.slice(2);
  const total = args[0] === "--total" ? Number(args[1]) : null;
  const videoIds = total !== null ? args.slice(2) : args;
  if (total !== null && (!Number.isInteger(total) || total < 1 || total > 1000)) {
    throw new Error("--total must be an integer between 1 and 1000");
  }
  if (!output || !videoIds.length || videoIds.some((id) => !/^[\w-]{11}$/.test(id))) {
    throw new Error("Usage: capture-public-comment-fixture.ts output.json VIDEO_ID...");
  }
  const apiKey = process.env.YOUTUBE_PUBLIC_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_PUBLIC_API_KEY is required");
  const provider = new GooglePublicYouTubeReadProvider({ apiKey });
  const fixture: PublicCommentFixture = {
    schemaVersion: "public-comment-fixture-v1",
    source: "youtube-public-api",
    capturedAt: new Date().toISOString(),
    sampling: `${total === null ? "100 comments per video" : `${total} total comments across videos in supplied upload order`}; public collector: newest top-level threads, parent before newest replies. Not a random sample. No human labels.`,
    videos: [],
    comments: [],
  };
  for (const videoId of [...new Set(videoIds)]) {
    const remaining = total === null ? 100 : total - fixture.comments.length;
    if (remaining <= 0) break;
    const video = await provider.getPublicVideo(videoId);
    const requestedTotalCount = [20, 50, 100, 1000].find((count) => count >= remaining)!;
    const collection = await collectPublicComments({ provider, videoId, requestedTotalCount });
    const selected = collection.comments.slice(0, remaining);
    const topLevelCount = selected.filter((comment) => comment.parentYoutubeCommentId === null).length;
    const replyCount = selected.length - topLevelCount;
    fixture.videos.push({ ...video, requestedCount: remaining, topLevelCount, replyCount });
    fixture.comments.push(...selected.map((comment) => ({
      id: comment.youtubeCommentId,
      videoId,
      parentId: comment.parentYoutubeCommentId,
      sourceText: comment.textOriginal ?? comment.textDisplay,
      publishedAt: comment.publishedAt,
      likeCount: comment.likeCount,
      raw: comment,
    })));
    console.log(`${videoId}: ${topLevelCount} parents + ${replyCount} replies`);
  }
  const validated = PublicCommentFixtureSchema.parse(fixture);
  mkdirSync(dirname(resolve(output)), { recursive: true });
  // Refuse to replace the original capture accidentally.
  writeFileSync(resolve(output), JSON.stringify(validated, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(`Captured ${validated.comments.length} comments: ${resolve(output)}`);
}

main().catch((error) => {
  // Never print provider request objects, which may contain credentials.
  console.error(error instanceof Error ? error.message : "Capture failed");
  process.exitCode = 1;
});
