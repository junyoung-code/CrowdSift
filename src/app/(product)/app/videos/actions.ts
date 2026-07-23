"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireViewer } from "@/features/auth/require-viewer";
import {
  ImportProcessingError,
  processImportJob,
} from "@/features/ingestion/process-import-job";
import { parseVideoImportRequest } from "@/features/ingestion/video-import-contract";
import type { OAuthTokens } from "@/features/youtube/contracts";
import { createYouTubeProvider } from "@/features/youtube/provider-factory";
import { decryptToken, encryptToken } from "@/features/youtube/token-crypto";
import {
  syncChannelVideos,
  type VideoSyncRepository,
} from "@/features/youtube/video-service";
import { getServerEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const loadYouTubeContext = async (workspaceId: string) => {
  const admin = createAdminSupabaseClient();
  const [
    { data: connection, error: connectionError },
    { data: channel, error: channelError },
  ] = await Promise.all([
    admin
      .from("youtube_connections")
      .select(
        "encrypted_access_token, encrypted_refresh_token, token_expires_at, granted_scopes, google_subject, status",
      )
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    admin
      .from("youtube_channel_candidates")
      .select("youtube_channel_id")
      .eq("workspace_id", workspaceId)
      .eq("selected", true)
      .maybeSingle(),
  ]);

  if (
    connectionError ||
    channelError ||
    !connection?.encrypted_access_token ||
    connection.status !== "connected" ||
    !channel
  ) {
    throw new Error("permission_revoked");
  }

  const environment = getServerEnv();
  const encryptionKey = Buffer.from(
    environment.YOUTUBE_TOKEN_ENCRYPTION_KEY,
    "base64",
  );
  const tokens: OAuthTokens = {
    accessToken: decryptToken(
      connection.encrypted_access_token,
      encryptionKey,
    ),
    refreshToken: connection.encrypted_refresh_token
      ? decryptToken(connection.encrypted_refresh_token, encryptionKey)
      : null,
    expiresAt: connection.token_expires_at,
    grantedScopes: connection.granted_scopes,
    googleSubject: connection.google_subject,
  };

  return {
    admin,
    channelId: channel.youtube_channel_id,
    encryptionKey,
    tokens,
  };
};

export const syncYouTubeVideosAction = async () => {
  const { workspaceId } = await requireViewer();

  try {
    const { admin, channelId, encryptionKey, tokens } =
      await loadYouTubeContext(workspaceId);
    const provider = createYouTubeProvider({
      async onTokenRefresh(refreshed) {
        const update: {
          encrypted_access_token?: string;
          encrypted_refresh_token?: string;
          token_expires_at?: string | null;
          updated_at: string;
        } = { updated_at: new Date().toISOString() };

        if (refreshed.accessToken) {
          update.encrypted_access_token = encryptToken(
            refreshed.accessToken,
            encryptionKey,
          );
        }
        if (refreshed.refreshToken) {
          update.encrypted_refresh_token = encryptToken(
            refreshed.refreshToken,
            encryptionKey,
          );
        }
        if (refreshed.expiresAt !== null) {
          update.token_expires_at = refreshed.expiresAt;
        }

        const { error } = await admin
          .from("youtube_connections")
          .update(update)
          .eq("workspace_id", workspaceId);
        if (error) {
          throw new Error("Refreshed Google tokens could not be stored");
        }
      },
    });
    const repository: VideoSyncRepository = {
      async upsertVideos(targetWorkspaceId, targetChannelId, videos) {
        if (videos.length === 0) {
          return;
        }

        const { error } = await admin.from("youtube_videos").upsert(
          videos.map((video) => ({
            workspace_id: targetWorkspaceId,
            youtube_channel_id: targetChannelId,
            youtube_video_id: video.id,
            title: video.title,
            thumbnail_url: video.thumbnailUrl,
            published_at: video.publishedAt,
            captured_at: new Date().toISOString(),
          })),
          { onConflict: "workspace_id,youtube_video_id" },
        );

        if (error) {
          throw error;
        }
      },
    };

    await syncChannelVideos({
      workspaceId,
      channelId,
      tokens,
      provider,
      repository,
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.message === "permission_revoked"
        ? "permission_revoked"
        : "video_sync_failed";
    redirect(`/app/videos?error=${reason}`);
  }

  revalidatePath("/app/videos");
  redirect("/app/videos?synced=1");
};

export const importYouTubeCommentsAction = async (formData: FormData) => {
  let request;

  try {
    request = parseVideoImportRequest({
      youtubeVideoId: formData.get("youtubeVideoId"),
      topLevelLimit: formData.get("topLevelLimit"),
    });
  } catch {
    redirect("/app/videos?error=invalid_import_request");
  }

  const { workspaceId } = await requireViewer();
  const admin = createAdminSupabaseClient();
  const [
    { data: video, error: videoError },
    { data: selectedChannel, error: channelError },
  ] = await Promise.all([
    admin
      .from("youtube_videos")
      .select("youtube_video_id, youtube_channel_id")
      .eq("workspace_id", workspaceId)
      .eq("youtube_video_id", request.youtubeVideoId)
      .maybeSingle(),
    admin
      .from("youtube_channel_candidates")
      .select("youtube_channel_id")
      .eq("workspace_id", workspaceId)
      .eq("selected", true)
      .maybeSingle(),
  ]);

  if (
    videoError ||
    channelError ||
    !video ||
    !selectedChannel ||
    video.youtube_channel_id !== selectedChannel.youtube_channel_id
  ) {
    redirect("/app/videos?error=video_not_owned");
  }

  const { data: job, error: jobError } = await admin
    .from("comment_import_jobs")
    .insert({
      workspace_id: workspaceId,
      youtube_video_id: video.youtube_video_id,
      requested_top_level_count: request.topLevelLimit,
      status: "pending",
    })
    .select("id")
    .single();

  if (jobError) {
    redirect("/app/videos?error=job_create_failed");
  }

  try {
    await processImportJob(job.id);
  } catch (error) {
    const reason =
      error instanceof ImportProcessingError ? error.code : "provider_error";
    redirect(`/app/videos?job=${job.id}&error=${reason}`);
  }

  revalidatePath("/app/videos");
  redirect(`/app/videos?job=${job.id}&imported=1`);
};
