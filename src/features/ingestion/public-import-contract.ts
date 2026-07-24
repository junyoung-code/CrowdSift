import { z } from "zod";

import {
  parsePublicYouTubeVideoUrl,
  publicCommentCountSchema,
  type PublicCommentCount,
} from "@/features/youtube/public-video-url";

const requestedTotalCountSchema = z.preprocess(
  (value) => (value === undefined || value === null || value === "" ? 20 : value),
  z.coerce.number().pipe(publicCommentCountSchema),
);

const publicImportInputSchema = z.object({
  url: z.string().trim().min(1),
  requestedTotalCount: requestedTotalCountSchema,
});

export type PublicImportRequest = {
  videoId: string;
  canonicalUrl: string;
  requestedTotalCount: PublicCommentCount;
};

export function parsePublicImportRequest(input: {
  url: unknown;
  requestedTotalCount: unknown;
}): PublicImportRequest {
  try {
    const parsed = publicImportInputSchema.parse(input);
    const video = parsePublicYouTubeVideoUrl(parsed.url);

    return {
      ...video,
      requestedTotalCount: parsed.requestedTotalCount,
    };
  } catch {
    throw new Error("invalid_public_import_request");
  }
}
