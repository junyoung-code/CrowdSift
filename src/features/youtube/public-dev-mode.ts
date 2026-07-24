export type PublicYouTubeDevModeEnvironment = {
  NODE_ENV?: string;
  ENABLE_PUBLIC_YOUTUBE_DEV_MODE?: string | boolean;
  YOUTUBE_PUBLIC_API_KEY?: string;
  EXTERNAL_PROVIDER_MODE?: "live" | "fixture";
  ALLOW_FIXTURE_PROVIDERS?: string | boolean;
};

export type PublicYouTubeDevMode = {
  enabled: boolean;
  configured: boolean;
};

const isEnabled = (value: string | boolean | undefined) =>
  value === true || value === "true";

export function getPublicYouTubeDevMode(
  environment: PublicYouTubeDevModeEnvironment,
): PublicYouTubeDevMode {
  const requested = isEnabled(environment.ENABLE_PUBLIC_YOUTUBE_DEV_MODE);

  if (environment.NODE_ENV === "production" && requested) {
    throw new Error(
      "Public YouTube development mode cannot be enabled in production.",
    );
  }

  return {
    enabled: requested && environment.NODE_ENV !== "production",
    configured:
      Boolean(environment.YOUTUBE_PUBLIC_API_KEY?.trim()) ||
      (environment.EXTERNAL_PROVIDER_MODE === "fixture" &&
        isEnabled(environment.ALLOW_FIXTURE_PROVIDERS) &&
        environment.NODE_ENV !== "production"),
  };
}
