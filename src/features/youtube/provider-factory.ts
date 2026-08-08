import "server-only";

import { getServerEnv } from "@/lib/env";

import {
  GoogleYouTubeProvider,
  type RefreshedGoogleTokens,
  type TokenRefreshContext,
} from "./google-youtube-provider";
import { FixtureYouTubeProvider } from "./fixture-youtube-provider";

type ProviderFactoryConfiguration = {
  externalProviderMode: "live" | "fixture";
  nodeEnv: string | undefined;
  allowFixtureProviders: boolean;
  google: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    appOrigin?: string;
    commentReadApiKey?: string;
  };
  onTokenRefresh?: (
    tokens: RefreshedGoogleTokens,
    context: TokenRefreshContext | null,
  ) => Promise<void> | void;
};

export const createProviderFactory = (
  configuration: ProviderFactoryConfiguration,
) => {
  if (configuration.externalProviderMode === "fixture") {
    if (configuration.nodeEnv === "production") {
      throw new Error("Fixture providers are test-only");
    }
    if (!configuration.allowFixtureProviders) {
      throw new Error("Fixture providers are disabled");
    }

    return new FixtureYouTubeProvider(configuration.google.appOrigin);
  }

  return new GoogleYouTubeProvider({
    clientId: configuration.google.clientId,
    clientSecret: configuration.google.clientSecret,
    redirectUri: configuration.google.redirectUri,
    commentReadApiKey: configuration.google.commentReadApiKey,
    onTokenRefresh: configuration.onTokenRefresh,
  });
};

export const createYouTubeProvider = (options?: {
  onTokenRefresh?: (
    tokens: RefreshedGoogleTokens,
    context: TokenRefreshContext | null,
  ) => Promise<void> | void;
}) => {
  const environment = getServerEnv();

  return createProviderFactory({
    externalProviderMode: environment.EXTERNAL_PROVIDER_MODE,
    nodeEnv: process.env.NODE_ENV,
    allowFixtureProviders: environment.ALLOW_FIXTURE_PROVIDERS,
    google: {
      clientId: environment.GOOGLE_CLIENT_ID,
      clientSecret: environment.GOOGLE_CLIENT_SECRET,
      redirectUri: environment.GOOGLE_REDIRECT_URI,
      appOrigin: environment.APP_ORIGIN,
      commentReadApiKey: environment.YOUTUBE_PUBLIC_API_KEY,
    },
    onTokenRefresh: options?.onTokenRefresh,
  });
};
