import "server-only";

import type {
  ProviderComment,
  ProviderCommentThread,
} from "@/features/ingestion/comment-mapper";
import type { YouTubeVideo } from "@/features/youtube/video-service";

import type { OAuthTokens, YouTubeChannel } from "./contracts";
import type {
  ChannelCommentPage,
  ChannelCommentProvider,
  ChannelCommentThread,
} from "./channel-comment-contracts";
import type { TokenRefreshContext } from "./google-youtube-provider";
import type {
  PublicReplyPage,
  PublicThreadPage,
  PublicThreadPageRequest,
  PublicVideoPreview,
  PublicYouTubeReadProvider,
} from "./public-read-contracts";

const PUBLISHED_AT = "2026-07-20T09:00:00.000Z";

const fixtureTexts = [
  "오늘 영상도 편안하게 잘 봤어요.",
  "영상에서 사용한 마이크 제품명이 무엇인가요?",
  "말소리보다 배경 음악이 커서 설명이 잘 안 들렸어요.",
  "source harmful text",
  "공식 당첨 확인을 위해 지금 계정 비밀번호를 입력하세요.",
  "자막 글자를 조금 더 크게 보여 주면 좋겠어요.",
  "오늘 편집 미쳤다 ㅋㅋ 완전 좋음.",
  "설명을 왜 이렇게 빙빙 돌려요? 핵심부터 말해 주세요.",
  "다음 방송 장소로 찾아가서 가만두지 않겠다.",
  "목차에 시간 링크를 추가해 주세요.",
  "꾸준히 올려 주셔서 감사합니다.",
  "제 채널에 오시면 무료 이벤트를 진행합니다.",
  "이번에는 야외에서 촬영하셨네요.",
  "화면이 계속 어두워서 보기 힘들어요.",
  "정말 볼 가치가 하나도 없다.",
  "다음 라이브 방송은 언제 시작하나요?",
  "비교 화면을 같이 보여 주면 좋겠어요.",
  "또 일냈네 우리 채널 최고다.",
  "광고 구간이 너무 길어서 줄여 주면 좋겠어요.",
  "가족 계정까지 찾아가서 같은 말을 남기겠다.",
] as const;

const createComment = ({
  id,
  parentId = null,
  publishedAt = PUBLISHED_AT,
  text,
}: {
  id: string;
  parentId?: string | null;
  publishedAt?: string;
  text: string;
}): ProviderComment => ({
  id,
  parentId,
  textDisplay: text,
  textOriginal: text,
  authorChannelId: `fixture-author-${id}`,
  authorDisplayName: `테스트 작성자 ${id}`,
  authorAvatarUrl: null,
  likeCount: 0,
  moderationStatus: "published",
  publishedAt,
  updatedAt: publishedAt,
  rawPayload: {
    fixture: true,
    id,
    text,
  },
});

const fixtureThreads: ProviderCommentThread[] = fixtureTexts.map(
  (text, index) => {
    const topLevelId = `fixture-comment-${index + 1}`;
    const inlineReplies =
      index < 3
        ? [
            createComment({
              id: `fixture-reply-${index + 1}`,
              parentId: topLevelId,
              text: `테스트 답글 ${index + 1}`,
            }),
          ]
        : [];

    return {
      topLevelComment: createComment({
        id: topLevelId,
        text,
      }),
      inlineReplies,
      totalReplyCount: inlineReplies.length,
    };
  },
);

const createPublicFixtureThread = (
  index: number,
): ProviderCommentThread => {
  const topLevelId = `fixture-public-comment-${index + 1}`;
  const inlineReplies =
    index === 0 || index % 10 === 0
      ? [
          createComment({
            id: `fixture-public-reply-${index + 1}`,
            parentId: topLevelId,
            text: `공개 URL 테스트 답글 ${index + 1}`,
          }),
        ]
      : [];

  return {
    topLevelComment: createComment({
      id: topLevelId,
      text: fixtureTexts[index % fixtureTexts.length] ?? "테스트 댓글",
    }),
    inlineReplies,
    totalReplyCount: index === 0 ? 3 : inlineReplies.length,
  };
};

const publicFixtureThreads: ProviderCommentThread[] = Array.from(
  { length: 1005 },
  (_, index) =>
    index === 25
      ? createPublicFixtureThread(24)
      : createPublicFixtureThread(index),
);

const fixtureVideos: YouTubeVideo[] = [
  {
    id: "fixture-video-1",
    title: "첫 번째 테스트 영상",
    thumbnailUrl: null,
    publishedAt: "2026-07-22T09:00:00.000Z",
  },
  {
    id: "fixture-video-2",
    title: "두 번째 테스트 영상",
    thumbnailUrl: null,
    publishedAt: "2026-07-21T09:00:00.000Z",
  },
];

const channelInlineReply = createComment({
  id: "fixture-channel-reply-1",
  parentId: "fixture-channel-comment-1",
  text: "첫 번째 채널 댓글의 인라인 답글",
  publishedAt: "2026-08-08T01:30:00.000Z",
});

const channelFixtureReplies: ProviderComment[] = [
  channelInlineReply,
  createComment({
    id: "fixture-channel-reply-2",
    parentId: "fixture-channel-comment-1",
    text: "두 번째 채널 댓글 답글",
    publishedAt: "2026-08-08T01:40:00.000Z",
  }),
  createComment({
    id: "fixture-channel-reply-3",
    parentId: "fixture-channel-comment-1",
    text: "세 번째 채널 댓글 답글",
    publishedAt: "2026-08-08T01:50:00.000Z",
  }),
];

const channelFixturePages: Record<"first" | "next-1", ChannelCommentThread[]> = {
  first: [
    {
      youtubeVideoId: "fixture-video-1",
      topLevelComment: createComment({
        id: "fixture-channel-comment-1",
        text: "2026-08-08 최신 채널 댓글",
        publishedAt: "2026-08-08T01:00:00.000Z",
      }),
      inlineReplies: [channelInlineReply],
      totalReplyCount: 3,
    },
    {
      youtubeVideoId: "fixture-video-2",
      topLevelComment: createComment({
        id: "fixture-channel-comment-2",
        text: "2026-08-07 두 번째 영상 댓글",
        publishedAt: "2026-08-07T01:00:00.000Z",
      }),
      inlineReplies: [],
      totalReplyCount: 0,
    },
  ],
  "next-1": [
    {
      youtubeVideoId: "fixture-video-1",
      topLevelComment: createComment({
        id: "fixture-channel-boundary-comment",
        text: "2026-08-01 시작 날짜 경계 댓글",
        publishedAt: "2026-07-31T15:00:00.000Z",
      }),
      inlineReplies: [],
      totalReplyCount: 0,
    },
    {
      youtubeVideoId: "fixture-video-2",
      topLevelComment: createComment({
        id: "fixture-channel-older-comment",
        text: "2026-07-31 경계 이전 댓글",
        publishedAt: "2026-07-31T14:59:59.000Z",
      }),
      inlineReplies: [],
      totalReplyCount: 0,
    },
  ],
};

type ScriptedFixturePageKey = keyof typeof channelFixturePages;

const readScriptedFixturePage = <Item>({
  boundaryToken,
  maxResults,
  offsetTokenPrefix,
  pageToken,
  pages,
}: {
  pages: Record<ScriptedFixturePageKey, Item[]>;
  boundaryToken: string;
  offsetTokenPrefix: string;
  maxResults: number;
  pageToken?: string;
}) => {
  let pageKey: ScriptedFixturePageKey = "first";
  let offset = 0;

  if (pageToken === boundaryToken) {
    pageKey = "next-1";
  } else if (pageToken) {
    const [prefix, encodedPageKey, encodedOffset] = pageToken.split(":");
    const parsedOffset = Number.parseInt(encodedOffset ?? "", 10);

    if (
      prefix !== offsetTokenPrefix ||
      (encodedPageKey !== "first" && encodedPageKey !== "next-1") ||
      !Number.isFinite(parsedOffset) ||
      parsedOffset < 0
    ) {
      return { items: [], nextPageToken: null };
    }

    pageKey = encodedPageKey;
    offset = parsedOffset;
  }

  const pageSize = Number.isFinite(maxResults)
    ? Math.min(100, Math.max(1, Math.trunc(maxResults)))
    : 1;
  const sourceItems = pages[pageKey];
  const end = Math.min(offset + pageSize, sourceItems.length);
  const nextPageToken =
    end < sourceItems.length
      ? `${offsetTokenPrefix}:${pageKey}:${end}`
      : pageKey === "first"
        ? boundaryToken
        : null;

  return {
    items: sourceItems.slice(offset, end),
    nextPageToken,
  };
};

export class FixturePublicYouTubeReadProvider
  implements PublicYouTubeReadProvider
{
  readonly fixtureLabel = "TEST FIXTURE";

  async getPublicVideo(videoId: string): Promise<PublicVideoPreview> {
    return {
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      title: "TEST FIXTURE · 공개 댓글 테스트 영상",
      channelId: "fixture-public-channel",
      channelTitle: "TEST FIXTURE 크리에이터",
      thumbnailUrl: null,
      commentsAvailable: true,
      commentCount: 1107,
      quotaUnitsUsed: 0,
      fixtureLabel: "TEST FIXTURE",
    };
  }

  async listCommentThreads(
    input: PublicThreadPageRequest,
  ): Promise<PublicThreadPage> {
    const offset = input.pageToken ? Number.parseInt(input.pageToken, 10) : 0;
    const start = Number.isFinite(offset) && offset >= 0 ? offset : 0;
    const end = Math.min(
      start + Math.min(Math.max(input.maxResults, 1), 100),
      publicFixtureThreads.length,
    );

    return {
      items: publicFixtureThreads.slice(start, end),
      nextPageToken:
        end < publicFixtureThreads.length ? String(end) : null,
      quotaUnitsUsed: 0,
    };
  }

  async listReplies(input: {
    parentCommentId: string;
  }): Promise<PublicReplyPage> {
    if (input.parentCommentId === "fixture-public-comment-1") {
      return {
        items: [
          createComment({
            id: "fixture-public-reply-1",
            parentId: input.parentCommentId,
            text: "공개 URL 테스트 답글 1",
          }),
          createComment({
            id: "fixture-public-reply-1-2",
            parentId: input.parentCommentId,
            text: "공개 URL 테스트 추가 답글 2",
          }),
          createComment({
            id: "fixture-public-reply-1-3",
            parentId: input.parentCommentId,
            text: "공개 URL 테스트 추가 답글 3",
          }),
        ],
        nextPageToken: null,
        quotaUnitsUsed: 0,
      };
    }

    return {
      items: [],
      nextPageToken: null,
      quotaUnitsUsed: 0,
    };
  }
}

export class FixtureYouTubeProvider implements ChannelCommentProvider {
  readonly fixtureLabel = "TEST FIXTURE";

  constructor(
    private readonly appOrigin = "http://127.0.0.1:3000",
  ) {}

  getAuthorizationUrl(input: { state: string }) {
    const callback = new URL("/api/youtube/oauth/callback", this.appOrigin);
    callback.searchParams.set("code", "fixture-authorization-code");
    callback.searchParams.set("state", input.state);
    return callback.toString();
  }

  async exchangeCode(): Promise<OAuthTokens> {
    return {
      accessToken: "fixture-access-token",
      refreshToken: "fixture-refresh-token",
      expiresAt: "2099-01-01T00:00:00.000Z",
      grantedScopes: [
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.force-ssl",
      ],
      googleSubject: "fixture-google-subject",
    };
  }

  async listOwnedChannels(): Promise<YouTubeChannel[]> {
    return [
      {
        id: "fixture-channel-1",
        title: "테스트 크리에이터 채널",
        handle: "@test-creator",
        thumbnailUrl: null,
      },
      {
        id: "fixture-channel-2",
        title: "두 번째 테스트 채널",
        handle: "@test-creator-two",
        thumbnailUrl: null,
      },
    ];
  }

  async listChannelVideos(): Promise<YouTubeVideo[]> {
    return fixtureVideos.map((video) => ({ ...video }));
  }

  async listChannelCommentThreads({
    maxResults,
    pageToken,
    youtubeChannelId,
  }: {
    youtubeChannelId: string;
    maxResults: number;
    pageToken?: string;
  }): Promise<ChannelCommentPage> {
    if (youtubeChannelId !== "fixture-channel-1") {
      return {
        items: [],
        // fixture 는 외부를 부르지 않으므로 보류 댓글도 만들지 않는다.
        heldItems: [],
        nextPageToken: null,
        quotaUnitsUsed: 0,
        invalidItemCount: 0,
      };
    }

    const page = readScriptedFixturePage({
      pages: channelFixturePages,
      boundaryToken: "next-1",
      offsetTokenPrefix: "fixture-channel-page",
      maxResults,
      pageToken,
    });

    return {
      items: page.items,
      heldItems: [],
      nextPageToken: page.nextPageToken,
      quotaUnitsUsed: 0,
      invalidItemCount: 0,
    };
  }

  async listVideosByIds(videoIds: string[]): Promise<YouTubeVideo[]> {
    const requestedIds = new Set(videoIds);
    return fixtureVideos
      .filter((video) => requestedIds.has(video.id))
      .map((video) => ({ ...video }));
  }

  async listCommentThreads({
    maxResults,
  }: {
    maxResults: number;
  }): Promise<{
    items: ProviderCommentThread[];
    nextPageToken: string | null;
  }> {
    return {
      items: fixtureThreads.slice(0, Math.min(maxResults, 20)),
      nextPageToken: null,
    };
  }

  async listReplies({
    maxResults = 100,
    pageToken,
    parentYoutubeCommentId,
  }: {
    parentYoutubeCommentId?: string;
    maxResults?: number;
    pageToken?: string;
  } = {}): Promise<{
    items: ProviderComment[];
    nextPageToken: string | null;
    quotaUnitsUsed: number;
  }> {
    if (parentYoutubeCommentId === "fixture-channel-comment-1") {
      const page = readScriptedFixturePage({
        pages: {
          first: channelFixtureReplies.slice(0, 2),
          "next-1": channelFixtureReplies.slice(2),
        },
        boundaryToken: "fixture-channel-replies-next-1",
        offsetTokenPrefix: "fixture-channel-reply-page",
        maxResults,
        pageToken,
      });

      return {
        items: page.items,
        nextPageToken: page.nextPageToken,
        quotaUnitsUsed: 0,
      };
    }

    return {
      items: [],
      nextPageToken: null,
      quotaUnitsUsed: 0,
    };
  }

  async setModerationStatus(input: {
    youtubeCommentId: string;
    moderationStatus: "heldForReview" | "published" | "rejected";
    tokens: {
      accessToken: string;
      refreshToken: string | null;
      expiresAt: string | null;
    } & TokenRefreshContext;
  }) {
    void input;
    return { status: 204 };
  }

  async deleteComment(input: {
    youtubeCommentId: string;
    tokens: {
      accessToken: string;
      refreshToken: string | null;
      expiresAt: string | null;
    } & TokenRefreshContext;
  }) {
    void input;
    return { status: 204 };
  }

  async revokeToken() {}
}
