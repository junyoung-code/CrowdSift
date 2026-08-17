/**
 * 조치가 실제로 먹혔는지 **API 에게** 묻는다. Studio 화면은 답이 아니다.
 *
 * `setModerationStatus` 는 성공하면 204 를 주고 본문이 없다. 즉 「보냈다」까지만 알 수
 * 있고 「그래서 지금 어떤 상태인가」는 다시 물어야 한다. Studio 의 보류됨 목록은
 * 유튜브가 자기 필터로 잡은 것 위주로 보여 주는 것 같아서, 그 화면이 비어 있다고
 * 조치가 실패한 것이라 단정할 수 없다.
 *
 * 그래서 세 가지를 같은 자리에서 찍는다.
 *   1. 그 댓글 하나의 moderationStatus (소유자 권한으로 읽어야 실려 온다)
 *   2. 채널의 heldForReview 목록에 그 ID 가 있는지
 *   3. published 목록에 아직 남아 있는지
 *
 *   npx tsx scripts/probe-moderation-status.ts
 *   npx tsx scripts/probe-moderation-status.ts <youtubeCommentId>
 *
 * 읽기만 한다. 유닛은 서너 개 나간다(조치 한 번의 1/10 도 안 된다).
 */
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

import { decryptToken } from "../src/features/youtube/token-crypto";
import { loadEnvFile, section } from "./test-comments";

/** 기본값: 오늘 조치를 건 그 댓글. */
const DEFAULT_COMMENT_ID = "UgwIYYOm2MWwDxsvtKR4AaABAg";

const main = async () => {
  loadEnvFile();

  const targetId = process.argv[2] ?? DEFAULT_COMMENT_ID;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [{ data: connection }, { data: channel }] = await Promise.all([
    supabase
      .from("youtube_connections")
      .select(
        "encrypted_access_token, encrypted_refresh_token, token_expires_at, granted_scopes",
      )
      .maybeSingle(),
    supabase
      .from("youtube_channel_candidates")
      .select("youtube_channel_id")
      .eq("selected", true)
      .maybeSingle(),
  ]);

  if (!connection?.encrypted_access_token || !channel) {
    throw new Error("연결이 없다. 먼저 채널을 연결해라.");
  }

  const key = Buffer.from(process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY!, "base64");
  const auth = new google.auth.OAuth2({
    clientId: process.env.YOUTUBE_OAUTH_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET,
  });
  auth.setCredentials({
    access_token: decryptToken(connection.encrypted_access_token, key),
    refresh_token: connection.encrypted_refresh_token
      ? decryptToken(connection.encrypted_refresh_token, key)
      : undefined,
  });

  const youtube = google.youtube({ version: "v3", auth });

  section("권한");
  console.log((connection.granted_scopes ?? []).join("\n"));

  section(`댓글 하나: ${targetId}`);
  const single = await youtube.comments.list({
    part: ["id", "snippet"],
    id: [targetId],
    textFormat: "plainText",
  });
  // 「댓글이 안 온 것」과 「와도 상태가 안 실린 것」은 다른 고장이다. 나눠서 찍는다.
  const items = single.data.items ?? [];
  console.log("응답 건수       ", items.length);
  const snippet = items[0]?.snippet;
  console.log("본문            ", snippet?.textDisplay ?? "(댓글 자체가 안 옴)");
  console.log("moderationStatus", snippet?.moderationStatus ?? "(안 실려 옴)");

  // 채널 전체를 상태별로 훑어 그 ID 가 어느 무리에 있는지 본다.
  for (const status of ["heldForReview", "published"] as const) {
    section(`${status} 목록`);
    const page = await youtube.commentThreads.list({
      part: ["id", "snippet"],
      allThreadsRelatedToChannelId: channel.youtube_channel_id,
      moderationStatus: status,
      maxResults: 100,
      textFormat: "plainText",
    });

    const rows = (page.data.items ?? []).map((thread) => ({
      id: thread.snippet?.topLevelComment?.id ?? "",
      // 상태가 실려 오는지 자체가 확인 대상이다. 목록에 넣었다고 붙는 것이 아니다.
      status:
        thread.snippet?.topLevelComment?.snippet?.moderationStatus ?? "(없음)",
      text: (
        thread.snippet?.topLevelComment?.snippet?.textDisplay ?? ""
      ).slice(0, 26),
    }));

    console.log(`${rows.length}건`);
    for (const row of rows.slice(0, 5)) {
      console.log(
        `  ${row.id === targetId ? "→" : " "} ${row.status.padEnd(14)} ${row.text}`,
      );
    }
    console.log(
      rows.some((row) => row.id === targetId)
        ? "  ** 대상 댓글이 여기 있다 **"
        : "  대상 댓글 없음",
    );
  }

  // 가져오기는 영상 하나씩 돈다. 채널 단위로 보류 댓글이 온다고 해서 영상 단위로도
  // 온다는 보장이 없다. 배선을 고치기 전에 여기서 확인한다.
  section("영상별 heldForReview");
  const held = await youtube.commentThreads.list({
    part: ["id", "snippet"],
    allThreadsRelatedToChannelId: channel.youtube_channel_id,
    moderationStatus: "heldForReview",
    maxResults: 100,
    textFormat: "plainText",
  });
  const videoIds = [
    ...new Set(
      (held.data.items ?? []).flatMap((thread) =>
        thread.snippet?.videoId ? [thread.snippet.videoId] : [],
      ),
    ),
  ];

  for (const videoId of videoIds) {
    const perVideo = await youtube.commentThreads.list({
      part: ["id", "snippet"],
      videoId,
      moderationStatus: "heldForReview",
      maxResults: 100,
      textFormat: "plainText",
    });
    console.log(`${videoId}  ${(perVideo.data.items ?? []).length}건`);
    for (const thread of perVideo.data.items ?? []) {
      const snippet = thread.snippet?.topLevelComment?.snippet;
      console.log(
        `   ${snippet?.moderationStatus ?? "?"}  ${(snippet?.textDisplay ?? "").slice(0, 26)}`,
      );
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
