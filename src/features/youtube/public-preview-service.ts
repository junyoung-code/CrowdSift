import { z } from "zod";

import { parsePublicYouTubeVideoUrl } from "./public-video-url";
import type {
  PublicVideoPreview,
  PublicYouTubeReadProvider,
} from "./public-read-contracts";

const publicVideoPreviewInputSchema = z.object({
  url: z.string().trim().min(1),
});

type PublicPreviewDependencies = {
  assertAuthenticatedWorkspace: () => Promise<unknown>;
  assertDevelopmentMode: () => Promise<void> | void;
  provider: PublicYouTubeReadProvider;
};

export async function previewPublicVideo(
  input: unknown,
  dependencies: PublicPreviewDependencies,
): Promise<PublicVideoPreview> {
  await dependencies.assertAuthenticatedWorkspace();
  await dependencies.assertDevelopmentMode();

  const parsedInput = publicVideoPreviewInputSchema.parse(input);
  const reference = parsePublicYouTubeVideoUrl(parsedInput.url);

  return dependencies.provider.getPublicVideo(reference.videoId);
}
