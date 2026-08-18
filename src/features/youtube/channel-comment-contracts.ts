import type {
  ProviderComment,
  ProviderCommentThread,
} from "@/features/ingestion/comment-mapper";

import type { OAuthTokens } from "./contracts";
import type { YouTubeVideo } from "./video-service";

/**
 * 소유자 읽기에 필요한 토큰과 승인 범위.
 *
 * 게시 댓글은 readonly scope로 읽을 수 있지만 검토 보류 목록은 force-ssl scope가
 * 있어야 한다. 승인 범위가 없는 오래된 호출자는 게시 댓글만 읽도록 선택 사항으로
 * 둔다.
 */
export type OwnerReadTokens = Pick<
  OAuthTokens,
  "accessToken" | "refreshToken" | "expiresAt"
> &
  Partial<Pick<OAuthTokens, "grantedScopes">>;

export type ChannelCommentThread = ProviderCommentThread & {
  youtubeVideoId: string;
};

export type ChannelCommentPage = {
  items: ChannelCommentThread[];
  /**
   * 유튜브가 검토 대기로 잡아 둔 댓글. **`items` 와 섞지 않는다.**
   *
   * 채널 목록은 최신순이라 수집이 「경계보다 오래된 것을 만나면 멈춘다」로 돈다.
   * 보류 댓글은 시간과 무관하게 딸려 오므로 같은 줄에 세우면 오래된 것 하나가
   * 백필 전체를 첫 장에서 끊는다. 여기 따로 담아 경계 판정에 관여하지 않게 한다.
   *
   * 소유자 권한으로 읽을 때만, 첫 장에서만 채워진다.
   */
  heldItems: ChannelCommentThread[];
  nextPageToken: string | null;
  quotaUnitsUsed: number;
  invalidItemCount: number;
};

export interface ChannelCommentProvider {
  listChannelCommentThreads(input: {
    youtubeChannelId: string;
    maxResults: number;
    pageToken?: string;
    /** 있으면 소유자로 읽는다. 없으면 게시된 댓글만 돌아온다. */
    tokens?: OwnerReadTokens;
  }): Promise<ChannelCommentPage>;
  listReplies(input: {
    parentYoutubeCommentId: string;
    maxResults: number;
    pageToken?: string;
    tokens?: OwnerReadTokens;
  }): Promise<{
    items: ProviderComment[];
    nextPageToken: string | null;
    quotaUnitsUsed: number;
  }>;
  listVideosByIds(videoIds: string[]): Promise<YouTubeVideo[]>;
}
