import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import type { OAuthTokens } from "./contracts";
import { createYouTubeProvider } from "./provider-factory";
import { decryptToken, encryptToken } from "./token-crypto";

/**
 * 저장해 둔 채널 연결을 열어 **소유자로 읽고 쓸 수 있는** provider 를 만든다.
 *
 * 영상 가져오기와 채널 동기화가 같은 일을 한다. 복호화와 갱신 저장을 두 벌로 두면
 * 한쪽만 고쳐지는 날이 온다. 토큰을 다루는 자리는 하나로 둔다.
 *
 * 구글이 access token 을 갱신해 주면 그 자리에서 다시 암호화해 저장한다. 이것을
 * 빠뜨리면 다음 실행이 만료된 토큰으로 시작한다.
 */

export const OWNER_CONNECTION_COLUMNS =
  "id, encrypted_access_token, encrypted_refresh_token, token_expires_at, granted_scopes, google_subject, status, updated_at";

export type OwnerConnectionRow = {
  id: string;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  token_expires_at: string | null;
  granted_scopes: string[];
  google_subject: string | null;
  status: string;
  updated_at: string;
};

/** 연결이 실제로 쓸 수 있는 상태인지. 아니면 `permission_revoked` 로 다뤄야 한다. */
export const isUsableOwnerConnection = (
  connection: OwnerConnectionRow | null | undefined,
): connection is OwnerConnectionRow & { encrypted_access_token: string } =>
  Boolean(connection?.encrypted_access_token) &&
  connection?.status === "connected";

export const openOwnerConnection = ({
  admin,
  connection,
  encryptionKey,
  workspaceId,
}: {
  admin: SupabaseClient<Database>;
  connection: OwnerConnectionRow & { encrypted_access_token: string };
  encryptionKey: Buffer;
  workspaceId: string;
}) => {
  const connectionVersion = { currentUpdatedAt: connection.updated_at };
  const tokens: OAuthTokens = {
    accessToken: decryptToken(connection.encrypted_access_token, encryptionKey),
    refreshToken: connection.encrypted_refresh_token
      ? decryptToken(connection.encrypted_refresh_token, encryptionKey)
      : null,
    expiresAt: connection.token_expires_at,
    grantedScopes: connection.granted_scopes,
    googleSubject: connection.google_subject,
  };

  const provider = createYouTubeProvider({
    async onTokenRefresh(refreshed) {
      const refreshedAt = new Date().toISOString();
      const update: {
        encrypted_access_token?: string;
        encrypted_refresh_token?: string;
        token_expires_at?: string | null;
        updated_at: string;
      } = { updated_at: refreshedAt };

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

      const { data, error } = await admin
        .from("youtube_connections")
        .update(update)
        .eq("id", connection.id)
        .eq("workspace_id", workspaceId)
        .eq("status", "connected")
        .eq("updated_at", connectionVersion.currentUpdatedAt)
        .select("updated_at")
        .maybeSingle();
      if (error || !data) {
        throw error ?? new Error("Refreshed YouTube token binding is stale");
      }
      connectionVersion.currentUpdatedAt = data.updated_at;
    },
  });

  return { connectionVersion, provider, tokens };
};

/**
 * refresh token이 취소·만료됐을 때만 호출한다. `updated_at` 비교는 사용자가 그 사이
 * 재연결한 새 token을 오래된 worker가 지우지 못하게 막는다.
 */
export const markOwnerConnectionRevoked = async ({
  admin,
  connectionId,
  connectionUpdatedAt,
  workspaceId,
}: {
  admin: SupabaseClient<Database>;
  connectionId: string;
  connectionUpdatedAt: string;
  workspaceId: string;
}) => {
  const { data, error } = await admin
    .from("youtube_connections")
    .update({
      encrypted_access_token: null,
      encrypted_refresh_token: null,
      token_expires_at: null,
      status: "revoked",
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId)
    .eq("workspace_id", workspaceId)
    .eq("status", "connected")
    .eq("updated_at", connectionUpdatedAt)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return data !== null;
};
