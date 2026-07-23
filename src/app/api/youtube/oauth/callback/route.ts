import { NextResponse } from "next/server";

import { requireViewer } from "@/features/auth/require-viewer";
import { consumeOAuthState } from "@/features/youtube/oauth-state-cookie";
import { createYouTubeProvider } from "@/features/youtube/provider-factory";
import { encryptToken } from "@/features/youtube/token-crypto";
import { getServerEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const getEncryptionKey = (encodedKey: string) =>
  Buffer.from(encodedKey, "base64");

const errorRedirect = (origin: string, reason: string) =>
  NextResponse.redirect(
    new URL(`/app/connect/youtube?error=${encodeURIComponent(reason)}`, origin),
  );

export const GET = async (request: Request) => {
  const environment = getServerEnv();
  const requestUrl = new URL(request.url);
  const appOrigin = new URL(environment.APP_ORIGIN).origin;
  const configuredCallback = new URL(environment.GOOGLE_REDIRECT_URI);

  if (
    requestUrl.origin !== appOrigin ||
    configuredCallback.origin !== appOrigin ||
    requestUrl.pathname !== configuredCallback.pathname
  ) {
    return errorRedirect(environment.APP_ORIGIN, "invalid_callback");
  }

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");

  if (!code || !state) {
    return errorRedirect(environment.APP_ORIGIN, "missing_code");
  }

  try {
    const statePayload = await consumeOAuthState(state);

    if (statePayload.purpose !== "read") {
      return errorRedirect(environment.APP_ORIGIN, "invalid_state");
    }
  } catch {
    return errorRedirect(environment.APP_ORIGIN, "invalid_state");
  }

  const { workspaceId } = await requireViewer();
  const admin = createAdminSupabaseClient();
  const encryptionKey = getEncryptionKey(
    environment.YOUTUBE_TOKEN_ENCRYPTION_KEY,
  );

  const persistRefreshedTokens = async (tokens: {
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: string | null;
  }) => {
    const updates: {
      encrypted_access_token?: string;
      encrypted_refresh_token?: string;
      token_expires_at?: string | null;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (tokens.accessToken) {
      updates.encrypted_access_token = encryptToken(
        tokens.accessToken,
        encryptionKey,
      );
    }
    if (tokens.refreshToken) {
      updates.encrypted_refresh_token = encryptToken(
        tokens.refreshToken,
        encryptionKey,
      );
    }
    if (tokens.expiresAt !== null) {
      updates.token_expires_at = tokens.expiresAt;
    }

    const { error } = await admin
      .from("youtube_connections")
      .update(updates)
      .eq("workspace_id", workspaceId);

    if (error) {
      throw new Error("Refreshed Google tokens could not be stored");
    }
  };

  try {
    const provider = createYouTubeProvider({
      onTokenRefresh: persistRefreshedTokens,
    });
    const tokens = await provider.exchangeCode(code);
    const { data: existingConnection, error: existingError } = await admin
      .from("youtube_connections")
      .select("encrypted_refresh_token")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (existingError) {
      throw new Error("Existing YouTube connection could not be loaded");
    }

    const { data: connection, error: connectionError } = await admin
      .from("youtube_connections")
      .upsert(
        {
          workspace_id: workspaceId,
          status: "pending_channel_selection",
          encrypted_access_token: encryptToken(
            tokens.accessToken,
            encryptionKey,
          ),
          encrypted_refresh_token: tokens.refreshToken
            ? encryptToken(tokens.refreshToken, encryptionKey)
            : (existingConnection?.encrypted_refresh_token ?? null),
          token_expires_at: tokens.expiresAt,
          granted_scopes: tokens.grantedScopes,
          google_subject: tokens.googleSubject,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id" },
      )
      .select("id")
      .single();

    if (connectionError) {
      throw new Error("YouTube connection could not be stored");
    }

    const channels = await provider.listOwnedChannels(tokens);
    const { error: deleteCandidatesError } = await admin
      .from("youtube_channel_candidates")
      .delete()
      .eq("workspace_id", workspaceId);

    if (deleteCandidatesError) {
      throw new Error("Old YouTube channel candidates could not be cleared");
    }

    if (channels.length > 0) {
      const { error: candidateError } = await admin
        .from("youtube_channel_candidates")
        .insert(
          channels.map((channel) => ({
            connection_id: connection.id,
            workspace_id: workspaceId,
            youtube_channel_id: channel.id,
            title: channel.title,
            handle: channel.handle,
            thumbnail_url: channel.thumbnailUrl,
            selected: channels.length === 1,
          })),
        );

      if (candidateError) {
        throw new Error("YouTube channel candidates could not be stored");
      }
    }

    const status =
      channels.length === 0
        ? "error"
        : channels.length === 1
          ? "connected"
          : "pending_channel_selection";
    const { error: statusError } = await admin
      .from("youtube_connections")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    if (statusError) {
      throw new Error("YouTube connection status could not be updated");
    }

    return NextResponse.redirect(
      new URL("/app/connect/youtube?connected=1", environment.APP_ORIGIN),
    );
  } catch {
    await admin
      .from("youtube_connections")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId);

    return errorRedirect(environment.APP_ORIGIN, "oauth_failed");
  }
};
