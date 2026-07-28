import { z } from "zod";

export const PUBLIC_COMMENT_COUNTS = [20, 50, 100, 1000] as const;

export const publicCommentCountSchema = z.union([
  z.literal(20),
  z.literal(50),
  z.literal(100),
  z.literal(1000),
]);

export type PublicCommentCount = z.infer<typeof publicCommentCountSchema>;

export type PublicVideoReference = {
  videoId: string;
  canonicalUrl: string;
};

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
]);
const SHORT_HOSTS = new Set(["youtu.be", "www.youtu.be"]);
const ERROR_MESSAGE =
  "지원하는 YouTube 영상 URL을 입력해 주세요. watch, youtu.be, shorts URL을 사용할 수 있습니다.";

function readVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(host) && url.pathname === "/watch") {
    return url.searchParams.get("v");
  }

  if (SHORT_HOSTS.has(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    return segments.length === 1 ? segments[0] : null;
  }

  if (YOUTUBE_HOSTS.has(host) && url.pathname.startsWith("/shorts/")) {
    const segments = url.pathname.split("/").filter(Boolean);
    return segments.length === 2 && segments[0] === "shorts"
      ? segments[1]
      : null;
  }

  return null;
}

export function parsePublicYouTubeVideoUrl(
  input: string,
): PublicVideoReference {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(ERROR_MESSAGE);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(ERROR_MESSAGE);
  }

  const videoId = readVideoId(url);

  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) {
    throw new Error(ERROR_MESSAGE);
  }

  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}
