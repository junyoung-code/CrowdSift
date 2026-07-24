export type ProviderComment = {
  id: string;
  parentId: string | null;
  textDisplay: string;
  textOriginal?: string | null;
  authorChannelId: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  likeCount: number;
  moderationStatus: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  rawPayload: unknown;
};

export type ProviderCommentThread = {
  topLevelComment: ProviderComment;
  inlineReplies: ProviderComment[];
  totalReplyCount: number;
};

export type SourceComment = {
  youtubeCommentId: string;
  parentYoutubeCommentId: string | null;
  authorChannelId: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  textDisplay: string;
  textOriginal: string | null;
  likeCount: number;
  sourceModerationStatus: string | null;
  rawPayload: unknown;
  publishedAt: string | null;
  updatedAt: string | null;
};

export interface YouTubeCommentCollectionProvider {
  listCommentThreads(input: {
    youtubeVideoId: string;
    maxResults: number;
    pageToken?: string;
  }): Promise<{
    items: ProviderCommentThread[];
    nextPageToken: string | null;
  }>;
  listReplies(input: {
    parentYoutubeCommentId: string;
    pageToken?: string;
  }): Promise<{
    items: ProviderComment[];
    nextPageToken: string | null;
  }>;
}

export const mapProviderComment = (
  comment: ProviderComment,
): SourceComment => ({
  youtubeCommentId: comment.id,
  parentYoutubeCommentId: comment.parentId,
  authorChannelId: comment.authorChannelId,
  authorDisplayName: comment.authorDisplayName,
  authorAvatarUrl: comment.authorAvatarUrl,
  textDisplay: comment.textDisplay,
  textOriginal: comment.textOriginal ?? null,
  likeCount: comment.likeCount,
  sourceModerationStatus: comment.moderationStatus,
  rawPayload: comment.rawPayload,
  publishedAt: comment.publishedAt,
  updatedAt: comment.updatedAt,
});

export const fetchSourceCommentPage = async ({
  pageToken,
  provider,
  topLevelLimit,
  youtubeVideoId,
}: {
  provider: YouTubeCommentCollectionProvider;
  youtubeVideoId: string;
  topLevelLimit: number;
  pageToken?: string;
}) => {
  const page = await provider.listCommentThreads({
    youtubeVideoId,
    maxResults: Math.min(100, topLevelLimit),
    pageToken,
  });
  const comments: SourceComment[] = [];
  const seenCommentIds = new Set<string>();

  const append = (comment: ProviderComment) => {
    if (seenCommentIds.has(comment.id)) {
      return;
    }
    seenCommentIds.add(comment.id);
    comments.push(mapProviderComment(comment));
  };

  for (const thread of page.items) {
    append(thread.topLevelComment);
    thread.inlineReplies.forEach(append);

    if (thread.totalReplyCount > thread.inlineReplies.length) {
      let replyPageToken: string | undefined;

      do {
        const replyPage = await provider.listReplies({
          parentYoutubeCommentId: thread.topLevelComment.id,
          pageToken: replyPageToken,
        });
        replyPage.items.forEach(append);
        replyPageToken = replyPage.nextPageToken ?? undefined;
      } while (replyPageToken);
    }
  }

  return {
    comments,
    nextPageToken: page.nextPageToken,
  };
};
