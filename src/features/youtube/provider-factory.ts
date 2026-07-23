import "server-only";

import { getServerEnv } from "@/lib/env";

import {
  GoogleYouTubeProvider,
  type RefreshedGoogleTokens,
} from "./google-youtube-provider";

export const createYouTubeProvider = (options?: {
  onTokenRefresh?: (tokens: RefreshedGoogleTokens) => Promise<void> | void;
}) => {
  const environment = getServerEnv();

  if (environment.EXTERNAL_PROVIDER_MODE !== "live") {
    throw new Error(
      "Fixture providers are not available in the real YouTube connection flow",
    );
  }

  return new GoogleYouTubeProvider({
    clientId: environment.GOOGLE_CLIENT_ID,
    clientSecret: environment.GOOGLE_CLIENT_SECRET,
    redirectUri: environment.GOOGLE_REDIRECT_URI,
    onTokenRefresh: options?.onTokenRefresh,
  });
};
