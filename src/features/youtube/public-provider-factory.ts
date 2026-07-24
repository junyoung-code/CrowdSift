import "server-only";

import { getServerEnv } from "@/lib/env";

import { getPublicYouTubeDevMode } from "./public-dev-mode";
import { GooglePublicYouTubeReadProvider } from "./google-public-read-provider";

type PublicProviderFactoryConfiguration = {
  nodeEnv: string | undefined;
  enabled: boolean;
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
  });

  return createPublicProviderFactory({
    nodeEnv: process.env.NODE_ENV,
    enabled: mode.enabled,
    apiKey: environment.YOUTUBE_PUBLIC_API_KEY,
  });
}
