export type YouTubeChannel = {
  id: string;
  title: string;
  handle: string | null;
  thumbnailUrl: string | null;
};

export type OAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  grantedScopes: string[];
  googleSubject: string | null;
};

export interface YouTubeProvider {
  getAuthorizationUrl(input: {
    state: string;
    scopes: string[];
    includeGrantedScopes: boolean;
    accessType: "offline";
    prompt: "consent";
  }): string;
  exchangeCode(code: string): Promise<OAuthTokens>;
  listOwnedChannels(tokens: OAuthTokens): Promise<YouTubeChannel[]>;
  revokeToken(token: string): Promise<void>;
}
