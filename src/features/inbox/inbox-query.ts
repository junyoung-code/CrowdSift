import type {
  CommentCategory,
  RecommendedAction,
  ReviewLevel,
} from "@/features/analysis/contracts";

export type InboxAnalysisState = "analyzed" | "pending" | "failed";
export type InboxActionState =
  | "pending_confirmation"
  | "awaiting_scope"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type InboxItem = {
  rawCommentId: string;
  sourceImportJobId: string;
  sourceKind: "owned_oauth" | "public_url";
  youtubeVideoId: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  publishedAt: string | null;
  sourceAvailable: boolean;
  analysisId: string | null;
  category: CommentCategory | null;
  reviewLevel: ReviewLevel | null;
  confidence: number | null;
  recommendedAction: RecommendedAction | null;
  manualReview: boolean | null;
  neutralText: string | null;
  normalizedQuestion: string | null;
  analysisState: InboxAnalysisState;
  actionState: InboxActionState | null;
  deleteEligible: boolean;
};

export type InboxQueryInput = {
  workspaceId: string;
  reviewLevels: ReviewLevel[];
  category: CommentCategory | null;
  videoId: string | null;
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
    videoId: trimmedValue(searchParams.video, 128),
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
