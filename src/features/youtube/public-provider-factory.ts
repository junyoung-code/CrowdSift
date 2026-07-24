import "server-only";

import { getServerEnv } from "@/lib/env";

import { getPublicYouTubeDevMode } from "./public-dev-mode";
import { FixturePublicYouTubeReadProvider } from "./fixture-youtube-provider";
import { GooglePublicYouTubeReadProvider } from "./google-public-read-provider";

type PublicProviderFactoryConfiguration = {
  nodeEnv: string | undefined;
  enabled: boolean;
  externalProviderMode: "live" | "fixture";
  allowFixtureProviders: boolean;
  apiKey?: string;
};

export function createPublicProviderFactory(
  configuration: PublicProviderFactoryConfiguration,
) {
  if (configuration.nodeEnv === "production") {
    throw new Error(
      "Public YouTube development mode cannot run in production.",
    );
  }

  if (!configuration.enabled) {
    throw new Error("Public YouTube development mode is disabled.");
  }

  if (configuration.externalProviderMode === "fixture") {
    if (!configuration.allowFixtureProviders) {
      throw new Error("Fixture providers are disabled.");
    }
    return new FixturePublicYouTubeReadProvider();
  }

  if (!configuration.apiKey?.trim()) {
    throw new Error("YOUTUBE_PUBLIC_API_KEY is required.");
  }

  return new GooglePublicYouTubeReadProvider({
    apiKey: configuration.apiKey,
  });
}

export function createPublicYouTubeReadProvider() {
  const environment = getServerEnv();
  const mode = getPublicYouTubeDevMode({
    NODE_ENV: process.env.NODE_ENV,
    ENABLE_PUBLIC_YOUTUBE_DEV_MODE:
      environment.ENABLE_PUBLIC_YOUTUBE_DEV_MODE,
    YOUTUBE_PUBLIC_API_KEY: environment.YOUTUBE_PUBLIC_API_KEY,
    EXTERNAL_PROVIDER_MODE: environment.EXTERNAL_PROVIDER_MODE,
    ALLOW_FIXTURE_PROVIDERS: environment.ALLOW_FIXTURE_PROVIDERS,
  });

  return createPublicProviderFactory({
    nodeEnv: process.env.NODE_ENV,
    enabled: mode.enabled,
    externalProviderMode: environment.EXTERNAL_PROVIDER_MODE,
    allowFixtureProviders: environment.ALLOW_FIXTURE_PROVIDERS,
    apiKey: environment.YOUTUBE_PUBLIC_API_KEY,
  });
}
