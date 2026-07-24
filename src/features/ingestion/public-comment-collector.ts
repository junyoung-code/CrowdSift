import {
  publicCommentCountSchema,
  type PublicCommentCount,
} from "@/features/youtube/public-video-url";
import type { PublicYouTubeReadProvider } from "@/features/youtube/public-read-contracts";

import {
  mapProviderComment,
  type ProviderComment,
  type SourceComment,
} from "./comment-mapper";

export type PublicCommentCollection = {
  comments: SourceComment[];
  topLevelCount: number;
  replyCount: number;
  youtubeQuotaUnitsUsed: number;
  nextPageToken: string | null;
};

const publishedAtValue = (comment: ProviderComment) => {
  if (!comment.publishedAt) {
    return 0;
  }

  const parsed = Date.parse(comment.publishedAt);
  return Number.isFinite(parsed) ? parsed : 0;
};

const newestFirst = (comments: ProviderComment[]) =>
  [...comments].sort(
    (left, right) => publishedAtValue(right) - publishedAtValue(left),
  );

const withParent = (
  comment: ProviderComment,
  parentId: string,
): ProviderComment => ({
  ...comment,
  parentId,
});

async function collectThreadReplies({
  inlineReplies,
  parentId,
  provider,
  totalReplyCount,
}: {
  inlineReplies: ProviderComment[];
  parentId: string;
  provider: PublicYouTubeReadProvider;
  totalReplyCount: number;
}) {
  const replies = inlineReplies.map((reply) => withParent(reply, parentId));
  let quotaUnitsUsed = 0;

  if (totalReplyCount > inlineReplies.length) {
    let pageToken: string | null = null;

    do {
      const page = await provider.listReplies({
        parentCommentId: parentId,
        maxResults: 100,
        pageToken,
      });
      quotaUnitsUsed += page.quotaUnitsUsed;
      replies.push(
        ...page.items.map((reply) => withParent(reply, parentId)),
      );
      pageToken = page.nextPageToken;
    } while (pageToken);
  }

  const uniqueReplies = new Map<string, ProviderComment>();
  for (const reply of replies) {
    if (!uniqueReplies.has(reply.id)) {
      uniqueReplies.set(reply.id, reply);
    }
  }

  return {
    replies: newestFirst([...uniqueReplies.values()]),
    quotaUnitsUsed,
  };
}

export async function collectPublicComments({
  provider,
  requestedTotalCount,
  videoId,
}: {
  provider: PublicYouTubeReadProvider;
  videoId: string;
  requestedTotalCount: number;
}): Promise<PublicCommentCollection> {
  const limit: PublicCommentCount =
    publicCommentCountSchema.parse(requestedTotalCount);
  const comments: SourceComment[] = [];
  const selectedCommentIds = new Set<string>();
  const selectedParentIds = new Set<string>();
  let topLevelCount = 0;
  let replyCount = 0;
  let youtubeQuotaUnitsUsed = 0;
  let pageToken: string | null = null;
  let nextPageToken: string | null = null;

  while (comments.length < limit) {
    const page = await provider.listCommentThreads({
      videoId,
      pageToken,
      maxResults: Math.min(100, limit - comments.length),
      order: "time",
    });
    youtubeQuotaUnitsUsed += page.quotaUnitsUsed;
    nextPageToken = page.nextPageToken;

    for (const thread of page.items) {
      const parent = {
        ...thread.topLevelComment,
        parentId: null,
      };

      if (!selectedCommentIds.has(parent.id)) {
        selectedCommentIds.add(parent.id);
        selectedParentIds.add(parent.id);
        comments.push(mapProviderComment(parent));
        topLevelCount += 1;
      }

      if (
        comments.length >= limit ||
        !selectedParentIds.has(parent.id) ||
        thread.totalReplyCount <= 0
      ) {
        if (comments.length >= limit) {
          break;
        }
        continue;
      }

      const collectedReplies = await collectThreadReplies({
        inlineReplies: thread.inlineReplies,
        parentId: parent.id,
        provider,
        totalReplyCount: thread.totalReplyCount,
      });
      youtubeQuotaUnitsUsed += collectedReplies.quotaUnitsUsed;

      for (const reply of collectedReplies.replies) {
        if (
          comments.length >= limit ||
          selectedCommentIds.has(reply.id)
        ) {
          continue;
        }
        selectedCommentIds.add(reply.id);
        comments.push(mapProviderComment(reply));
        replyCount += 1;
      }

      if (comments.length >= limit) {
        break;
      }
    }

    if (comments.length >= limit || !page.nextPageToken) {
      break;
    }
    pageToken = page.nextPageToken;
  }

  return {
    comments,
    topLevelCount,
    replyCount,
    youtubeQuotaUnitsUsed,
    nextPageToken,
  };
}
