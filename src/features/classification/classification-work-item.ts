import type { ClassificationWorkItem } from "./classification-service";
import {
  DEFAULT_CLASSIFICATION_PROFILE,
  type ClassificationProfile,
} from "./schemas";

type Claim = {
  itemId: string;
  rawCommentId: string;
  workspaceId: string;
};

type RawComment = {
  id: string;
  workspaceId: string;
  youtubeVideoId: string;
  youtubeCommentId: string;
  parentYoutubeCommentId: string | null;
  textDisplay: string;
};

type Video = { youtubeVideoId: string; title: string };

export const buildClassificationWorkItems = ({
  channelId,
  claims,
  policyVersion,
  profile,
  rawComments,
  videos,
}: {
  claims: Claim[];
  rawComments: RawComment[];
  videos: Video[];
  channelId: string;
  policyVersion: number;
  /** 채널이 아직 아무것도 등록하지 않았으면 공통 기본값으로 판단한다. */
  profile?: ClassificationProfile;
}): ClassificationWorkItem[] => {
  const rawById = new Map(rawComments.map((comment) => [comment.id, comment]));
  const rawByYoutubeId = new Map(
    rawComments.map((comment) => [comment.youtubeCommentId, comment]),
  );
  const videoById = new Map(videos.map((video) => [video.youtubeVideoId, video]));

  return claims.map((claim) => {
    const raw = rawById.get(claim.rawCommentId);
    if (!raw || raw.workspaceId !== claim.workspaceId) {
      throw new Error("classification_source_missing");
    }
    const parent = raw.parentYoutubeCommentId
      ? rawByYoutubeId.get(raw.parentYoutubeCommentId)
      : null;

    return {
      id: claim.itemId,
      workspaceId: claim.workspaceId,
      rawCommentId: claim.rawCommentId,
      sourceText: raw.textDisplay,
      videoTitle: videoById.get(raw.youtubeVideoId)?.title ?? "",
      channelId,
      policyVersion,
      profile: profile ?? DEFAULT_CLASSIFICATION_PROFILE,
      similarExamples: [],
      parent:
        parent && parent.workspaceId === claim.workspaceId
          ? { id: parent.id, text: parent.textDisplay }
          : null,
    };
  });
};
