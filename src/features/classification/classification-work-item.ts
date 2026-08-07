import type { ClassificationWorkItem } from "./classification-service";
import { DEFAULT_CLASSIFICATION_PROFILE } from "./schemas";

type Claim = {
  itemId: string;
  rawCommentId: string;
  workspaceId: string;
};

type RawComment = {
  id: string;
  workspaceId: string;
  youtubeVideoId: string;
  textDisplay: string;
};

type Video = { youtubeVideoId: string; title: string };

export const buildClassificationWorkItems = ({
  channelId,
  claims,
  policyVersion,
  rawComments,
  videos,
}: {
  claims: Claim[];
  rawComments: RawComment[];
  videos: Video[];
  channelId: string;
  policyVersion: number;
}): ClassificationWorkItem[] => {
  const rawById = new Map(rawComments.map((comment) => [comment.id, comment]));
  const videoById = new Map(videos.map((video) => [video.youtubeVideoId, video]));

  return claims.map((claim) => {
    const raw = rawById.get(claim.rawCommentId);
    if (!raw || raw.workspaceId !== claim.workspaceId) {
      throw new Error("classification_source_missing");
    }

    return {
      id: claim.itemId,
      workspaceId: claim.workspaceId,
      rawCommentId: claim.rawCommentId,
      sourceText: raw.textDisplay,
      videoTitle: videoById.get(raw.youtubeVideoId)?.title ?? "",
      channelId,
      policyVersion,
      profile: DEFAULT_CLASSIFICATION_PROFILE,
      similarExamples: [],
    };
  });
};
