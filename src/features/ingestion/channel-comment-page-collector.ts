import type { ChannelCommentProvider } from "@/features/youtube/channel-comment-contracts";

import {
  mapProviderComment,
  type ProviderComment,
  type SourceComment,
} from "./comment-mapper";

export type ChannelCommentCollectionPage = {
  comments: SourceComment[];
  groups: Map<string, SourceComment[]>;
  observedCount: number;
  topLevelCount: number;
  replyCount: number;
  invalidCount: number;
  nextPageToken: string | null;
  reachedBoundary: boolean;
  quotaUnitsUsed: number;
};

export type ChannelCommentCollectionKind =
  | "backfill_recent"
  | "incremental";

const isCandidate = ({
  boundaryAt,
  kind,
  publishedAt,
}: {
  boundaryAt: string;
  kind: ChannelCommentCollectionKind;
  publishedAt: string | null;
}) => {
  if (publishedAt === null) {
    return true;
  }

  const publishedAtValue = Date.parse(publishedAt);
  if (!Number.isFinite(publishedAtValue)) {
    return true;
  }

  const boundaryValue = Date.parse(boundaryAt);
  return kind === "backfill_recent"
    ? publishedAtValue >= boundaryValue
    : publishedAtValue > boundaryValue;
};

const withParent = (
  comment: ProviderComment,
  parentYoutubeCommentId: string,
): ProviderComment => ({
  ...comment,
  parentId: parentYoutubeCommentId,
});

async function collectReplies({
  inlineReplies,
  parentYoutubeCommentId,
  provider,
  totalReplyCount,
}: {
  inlineReplies: ProviderComment[];
  parentYoutubeCommentId: string;
  provider: ChannelCommentProvider;
  totalReplyCount: number;
}) {
  const replies = inlineReplies.map((reply) =>
    withParent(reply, parentYoutubeCommentId),
  );
  let quotaUnitsUsed = 0;

  if (totalReplyCount > inlineReplies.length) {
    let pageToken: string | undefined;
    const seenPageTokens = new Set<string>();

    while (true) {
      const page = await provider.listReplies({
        parentYoutubeCommentId,
        maxResults: 100,
        pageToken,
      });
      quotaUnitsUsed += page.quotaUnitsUsed;
      replies.push(
        ...page.items.map((reply) =>
          withParent(reply, parentYoutubeCommentId),
        ),
      );

      const nextPageToken = page.nextPageToken ?? undefined;
      if (!nextPageToken || seenPageTokens.has(nextPageToken)) {
        break;
      }

      seenPageTokens.add(nextPageToken);
      pageToken = nextPageToken;
    }
  }

  const uniqueReplies = new Map<string, ProviderComment>();
  for (const reply of replies) {
    if (!uniqueReplies.has(reply.id)) {
      uniqueReplies.set(reply.id, reply);
    }
  }

  return {
    replies: [...uniqueReplies.values()],
    quotaUnitsUsed,
  };
}

export async function collectChannelCommentPage({
  boundaryAt,
  kind,
  pageToken,
  provider,
  youtubeChannelId,
}: {
  provider: ChannelCommentProvider;
  youtubeChannelId: string;
  pageToken: string | null;
  boundaryAt: string;
  kind: ChannelCommentCollectionKind;
}): Promise<ChannelCommentCollectionPage> {
  const page = await provider.listChannelCommentThreads({
    youtubeChannelId,
    maxResults: 100,
    pageToken: pageToken ?? undefined,
  });
  const comments: SourceComment[] = [];
  const groups = new Map<string, SourceComment[]>();
  const selectedCommentIds = new Set<string>();
  let topLevelCount = 0;
  let replyCount = 0;
  let quotaUnitsUsed = page.quotaUnitsUsed;
  let reachedBoundary = false;

  for (const thread of page.items) {
    const parent = {
      ...thread.topLevelComment,
      parentId: null,
    };

    if (
      !isCandidate({
        boundaryAt,
        kind,
        publishedAt: parent.publishedAt,
      })
    ) {
      reachedBoundary = true;
      break;
    }

    if (selectedCommentIds.has(parent.id)) {
      continue;
    }

    selectedCommentIds.add(parent.id);
    const group = groups.get(thread.youtubeVideoId) ?? [];
    const mappedParent = mapProviderComment(parent);
    group.push(mappedParent);
    groups.set(thread.youtubeVideoId, group);
    comments.push(mappedParent);
    topLevelCount += 1;

    const collectedReplies = await collectReplies({
      inlineReplies: thread.inlineReplies,
      parentYoutubeCommentId: parent.id,
      provider,
      totalReplyCount: thread.totalReplyCount,
    });
    quotaUnitsUsed += collectedReplies.quotaUnitsUsed;

    for (const reply of collectedReplies.replies) {
      if (
        selectedCommentIds.has(reply.id) ||
        (kind === "incremental" &&
          !isCandidate({
            boundaryAt,
            kind,
            publishedAt: reply.publishedAt,
          }))
      ) {
        continue;
      }

      selectedCommentIds.add(reply.id);
      const mappedReply = mapProviderComment(reply);
      group.push(mappedReply);
      comments.push(mappedReply);
      replyCount += 1;
    }
  }

  return {
    comments,
    groups,
    observedCount: comments.length + page.invalidItemCount,
    topLevelCount,
    replyCount,
    invalidCount: page.invalidItemCount,
    nextPageToken: reachedBoundary ? null : page.nextPageToken,
    reachedBoundary,
    quotaUnitsUsed,
  };
}
