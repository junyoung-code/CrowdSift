export type PublicYouTubeDevModeEnvironment = {
  NODE_ENV?: string;
  ENABLE_PUBLIC_YOUTUBE_DEV_MODE?: string | boolean;
  YOUTUBE_PUBLIC_API_KEY?: string;
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
    configured: Boolean(environment.YOUTUBE_PUBLIC_API_KEY?.trim()),
  };
}
