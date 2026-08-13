import type {
  CommentCategory,
  RecommendedAction,
  ReviewLevel,
} from "@/features/analysis/contracts";

export type InboxAnalysisState = "analyzed" | "pending" | "failed";
export type InboxClassificationStatus = "decided" | "review_queue";

export type InboxClassificationStageTrace = {
  status: "succeeded" | "failed" | "refused";
  modelIdentifier: string;
  providerResponseId: string | null;
  promptVersion: string | null;
  latencyMs: number | null;
  usage: Record<string, number>;
  output: Record<string, unknown>;
  errorCode: string | null;
};

export type InboxClassificationTrace = {
  moderation: InboxClassificationStageTrace | null;
  luna: InboxClassificationStageTrace | null;
  branch: {
    outcome: "instant_safe" | "verify";
    reasons: string[];
    protection: Record<string, unknown>;
  } | null;
  terra: InboxClassificationStageTrace | null;
  final: {
    status: InboxClassificationStatus;
    level: ReviewLevel | null;
    basis: string;
    hideSource: boolean;
    raisedByModeration: boolean;
    reasonCodes: string[];
    recommendedActions: string[];
  } | null;
};
/**
 * YouTube 가 쓰는 댓글 상태. 우리 등급(safe/caution/risk)과는 다른 축이다.
 *
 * `likelySpam` 은 유튜브가 붙이고 우리는 바꿀 수 없다. 그래서 조치 버튼을 고를 때
 * 게시된 것과 같이 취급하지 않는다.
 */
export type SourceModerationStatus =
  | "published"
  | "heldForReview"
  | "rejected"
  | "likelySpam";

export type InboxActionState =
  | "pending_confirmation"
  | "awaiting_scope"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type InboxReply = {
  rawCommentId: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  publishedAt: string | null;
  likeCount: number;
  reviewLevel: ReviewLevel | null;
  sourceAvailable: boolean;
  safeSourceText: string | null;
  neutralText: string | null;
  normalizedQuestion: string | null;
};

export type InboxItem = {
  rawCommentId: string;
  sourceImportJobId: string;
  sourceKind: "owned_oauth" | "public_url";
  youtubeVideoId: string;
  videoTitle: string | null;
  videoThumbnailUrl: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  publishedAt: string | null;
  likeCount: number;
  sourceAvailable: boolean;
  safeSourceText: string | null;
  analysisId: string | null;
  classificationStatus: InboxClassificationStatus | null;
  classificationTrace: InboxClassificationTrace | null;
  category: CommentCategory | null;
  reviewLevel: ReviewLevel | null;
  /**
   * AI 가 마지막으로 낸 등급. reviewLevel 과 다르면 사람이 고쳐 놓은 것이다.
   *
   * 사람 손이 이기지만, 다시 분석해서 위험이 새로 나왔다면 그건 알려야 한다.
   */
  aiReviewLevel: ReviewLevel | null;
  confidence: number | null;
  recommendedAction: RecommendedAction | null;
  manualReview: boolean | null;
  neutralText: string | null;
  normalizedQuestion: string | null;
  analysisState: InboxAnalysisState;
  actionState: InboxActionState | null;
  /**
   * 이 댓글이 지금 YouTube 에서 어떤 상태인지.
   *
   * null 은 「모른다」다. API 키로 읽던 시절에 들어온 댓글이 그렇다. 모를 때는
   * 조치 버튼을 가리지 않는다 — 아는 척하는 것보다 낫다.
   */
  sourceModerationStatus: SourceModerationStatus | null;
  deleteEligible: boolean;
  replyCount: number;
  replies: InboxReply[];
};

export type InboxQueryInput = {
  workspaceId: string;
  reviewLevels: ReviewLevel[];
  category: CommentCategory | null;
  videoIds: string[];
  analysisState: InboxAnalysisState | null;
  actionState: InboxActionState | null;
  minConfidence: number | null;
  maxConfidence: number | null;
  search: string | null;
  limit: number;
  offset: number;
};

export interface InboxRepository {
  query(input: InboxQueryInput): Promise<{
    items: InboxItem[];
    total: number;
  }>;
}

type SearchParams = Record<string, string | string[] | undefined>;

const REVIEW_LEVELS = ["safe", "caution", "risk"] as const;
const CATEGORIES = [
  "positive",
  "neutral",
  "question",
  "constructive_feedback",
  "toxic_but_actionable",
  "abusive_no_signal",
  "spam_advertisement",
  "phishing",
  "harassment",
  "threat_or_serious_risk",
  "uncertain",
] as const;
const ANALYSIS_STATES = ["analyzed", "pending", "failed"] as const;
const ACTION_STATES = [
  "pending_confirmation",
  "awaiting_scope",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;

const firstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const parseEnum = <T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T | null => {
  const candidate = firstValue(value);
  return candidate && allowed.includes(candidate as T)
    ? (candidate as T)
    : null;
};

const parseReviewLevels = (
  value: string | string[] | undefined,
): ReviewLevel[] => {
  if (value === undefined) {
    return ["caution", "risk"];
  }

  const candidates = (Array.isArray(value) ? value : value.split(","))
    .flatMap((entry) => entry.split(","))
    .filter((entry): entry is ReviewLevel =>
      REVIEW_LEVELS.includes(entry as ReviewLevel),
    );

  return [...new Set(candidates)];
};

/**
 * 영상은 여럿 고를 수 있다. 판단이 영상마다 어떻게 갈리는지는 나란히 놓아야 보인다.
 *
 * 체크박스 여러 개가 같은 이름으로 오면 배열이고, 하나만 오면 문자열이다. 주소를
 * 손으로 고쳐 `?video=a,b` 로 넣는 경우도 받는다.
 */
const parseVideoIds = (value: string | string[] | undefined): string[] => {
  if (value === undefined) return [];

  const candidates = (Array.isArray(value) ? value : [value])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim().slice(0, 128))
    .filter((entry) => entry.length > 0);

  // 주소를 손으로 늘려 질의를 무겁게 만들 수 있으므로 상한을 둔다.
  return [...new Set(candidates)].slice(0, 50);
};

const parseConfidence = (value: string | string[] | undefined) => {
  const rawValue = firstValue(value)?.trim();
  if (!rawValue) {
    return null;
  }
  const candidate = Number(rawValue);
  return Number.isFinite(candidate)
    ? Math.min(Math.max(candidate, 0), 1)
    : null;
};

const trimmedValue = (
  value: string | string[] | undefined,
  maxLength = 200,
) => {
  const candidate = firstValue(value)?.trim();
  return candidate ? candidate.slice(0, maxLength) : null;
};

export const getInboxPage = async (
  {
    searchParams,
    workspaceId,
  }: {
    workspaceId: string;
    searchParams: SearchParams;
  },
  repository: InboxRepository,
) => {
  const page = Math.max(
    Math.trunc(Number(firstValue(searchParams.page))) || 1,
    1,
  );
  const limit = 25;
  const filters: InboxQueryInput = {
    workspaceId,
    reviewLevels: parseReviewLevels(searchParams.levels),
    category: parseEnum(searchParams.category, CATEGORIES),
    videoIds: parseVideoIds(searchParams.video),
    analysisState: parseEnum(searchParams.analysis, ANALYSIS_STATES),
    actionState: parseEnum(searchParams.action, ACTION_STATES),
    minConfidence: parseConfidence(searchParams.minConfidence),
    maxConfidence: parseConfidence(searchParams.maxConfidence),
    search: trimmedValue(searchParams.search),
    limit,
    offset: (page - 1) * limit,
  };
  const result = await repository.query(filters);

  return { ...result, filters };
};
