import "server-only";

import { google } from "googleapis";
import type { Credentials } from "google-auth-library";

import type {
  OAuthTokens,
  YouTubeChannel,
  YouTubeProvider,
} from "./contracts";

export type RefreshedGoogleTokens = {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
};

type TokenRefreshHandler = (
  tokens: RefreshedGoogleTokens,
) => Promise<void> | void;

const toExpiresAt = (expiryDate?: number | null) =>
  expiryDate ? new Date(expiryDate).toISOString() : null;

const toRefreshPayload = (credentials: Credentials): RefreshedGoogleTokens => ({
  accessToken: credentials.access_token ?? null,
  refreshToken: credentials.refresh_token ?? null,
  expiresAt: toExpiresAt(credentials.expiry_date),
});

const getResponseStatus = (error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "status" in error.response
  ) {
    return error.response.status;
  }

  return null;
};

export class GoogleYouTubeProvider implements YouTubeProvider {
  constructor(
    private readonly configuration: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      onTokenRefresh?: TokenRefreshHandler;
    },
  ) {}

  private createOAuthClient({ listenForRefresh = false } = {}) {
    const client = new google.auth.OAuth2({
      clientId: this.configuration.clientId,
      clientSecret: this.configuration.clientSecret,
      redirectUri: this.configuration.redirectUri,
    });

    if (listenForRefresh && this.configuration.onTokenRefresh) {
      client.on("tokens", (tokens) => {
        void this.configuration.onTokenRefresh?.(toRefreshPayload(tokens));
      });
    }

    return client;
  }

  getAuthorizationUrl(input: {
    state: string;
    scopes: string[];
    includeGrantedScopes: boolean;
    accessType: "offline";
    prompt: "consent";
  }) {
    return this.createOAuthClient().generateAuthUrl({
      state: input.state,
      scope: input.scopes,
      access_type: input.accessType,
      include_granted_scopes: input.includeGrantedScopes,
      prompt: input.prompt,
    });
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const client = this.createOAuthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.access_token) {
      throw new Error("Google did not return an access token");
    }

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: toExpiresAt(tokens.expiry_date),
      grantedScopes: tokens.scope?.split(/\s+/).filter(Boolean) ?? [],
      googleSubject: null,
    };
  }

  async listOwnedChannels(tokens: OAuthTokens): Promise<YouTubeChannel[]> {
    const client = this.createOAuthClient({ listenForRefresh: true });
    client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiresAt
        ? new Date(tokens.expiresAt).getTime()
        : undefined,
    });

    const youtube = google.youtube({
      version: "v3",
      auth: client,
    });
    const response = await youtube.channels.list({
      part: ["snippet"],
      mine: true,
      maxResults: 50,
    });

    return (response.data.items ?? []).flatMap((channel) => {
      if (!channel.id || !channel.snippet?.title) {
        return [];
      }

      const thumbnails = channel.snippet.thumbnails;

      return [
        {
          id: channel.id,
          title: channel.snippet.title,
          handle: channel.snippet.customUrl ?? null,
          thumbnailUrl:
            thumbnails?.high?.url ??
            thumbnails?.medium?.url ??
            thumbnails?.default?.url ??
            null,
        },
      ];
    });
  }

  async revokeToken(token: string) {
    try {
      await this.createOAuthClient().revokeToken(token);
    } catch (error) {
      if (getResponseStatus(error) === 400) {
        return;
      }

      throw error;
    }
  }
}
