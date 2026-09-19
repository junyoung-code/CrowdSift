import {
  CaretDown,
  CaretLeft,
  CaretRight,
  ChatCircleDots,
  CheckCircle,
  Circle,
  ThumbsUp,
  DotsThreeVertical,
  Info,
  User,
  ShieldWarning,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";

import { InboxFilters } from "./inbox-filters";
import styles from "./inbox-feed.module.css";

import type {
  CommentCategory,
  RecommendedAction,
  ReviewLevel,
} from "@/features/analysis/contracts";

import type { ModerationAction } from "@/features/moderation/contracts";

import { canAllowChannelExpression } from "./allow-expression-eligibility";
import type {
  InboxActionState,
  InboxAnalysisState,
  InboxItem,
  SourceModerationStatus,
} from "./inbox-query";
import { SourceReveal } from "./source-reveal";
import { BASIS_LABELS, ClassificationTrace } from "./classification-trace";

const LEVEL_DETAILS: Record<
  ReviewLevel,
  { label: string; filterLabel: string; icon: typeof CheckCircle }
> = {
  safe: { label: "안전", filterLabel: "안전 댓글", icon: CheckCircle },
  caution: { label: "주의", filterLabel: "주의 댓글", icon: WarningCircle },
  risk: { label: "위험", filterLabel: "위험 댓글", icon: ShieldWarning },
};

const CATEGORY_LABELS: Record<CommentCategory, string> = {
  positive: "긍정 반응",
  neutral: "중립",
  question: "질문",
  constructive_feedback: "건설적인 피드백",
  toxic_but_actionable: "유해하지만 참고할 내용 있음",
  abusive_no_signal: "참고할 내용 없는 악성 표현",
  spam_advertisement: "스팸·광고",
  phishing: "피싱 의심",
  harassment: "괴롭힘",
  threat_or_serious_risk: "협박·심각한 위험",
  uncertain: "시프티가 보기에 안전해요!",
};

const RECOMMENDED_ACTION_LABELS: Record<RecommendedAction, string> = {
  none: "조치 없음",
  review: "직접 검토",
  hold_for_review: "검토 보류",
  publish: "게시 유지",
  reject: "숨김 검토",
};

const ANALYSIS_STATE_LABELS: Record<InboxAnalysisState, string> = {
  analyzed: "분석 완료",
  pending: "분석 대기",
  failed: "분석 실패",
};

const ACTION_STATE_LABELS: Record<InboxActionState, string> = {
  pending_confirmation: "확인 대기",
  awaiting_scope: "권한 대기",
  running: "처리 중",
  succeeded: "조치 완료",
  failed: "조치 실패",
  cancelled: "조치 취소",
};

export type ActiveFilters = {
  reviewLevels: ReviewLevel[];
  classificationStatus?: InboxItem["classificationStatus"];
  category?: CommentCategory | null;
  videoIds?: string[];
  analysisState?: InboxAnalysisState | null;
  actionState?: InboxActionState | null;
  minConfidence?: number | null;
  maxConfidence?: number | null;
  search?: string | null;
  limit?: number;
  offset?: number;
  period?: "all" | "7d" | "30d" | "90d";
  sort?: "latest" | "likes";
};

const getPrimarySummary = (item: InboxItem) => {
  const semantic = item.classificationTrace?.semantic;
  if (semantic?.rewriteStatus === "failed") return "피드백 정리 실패 · 재시도할 수 있습니다.";
  if (semantic?.rewriteStatus === "pending") return "피드백의 의미 보존을 검증하고 있습니다.";
  if (semantic?.otherTargetHarm && item.reviewLevel === "safe") return "크리에이터 대상 공격은 없지만 공격 표현이 있어 원문을 보호합니다.";
  if (item.neutralText) return item.neutralText;
  if (item.normalizedQuestion) return item.normalizedQuestion;
  if (item.analysisState === "pending") {
    return "아직 AI 분석을 시작하지 않은 댓글입니다.";
  }
  if (item.analysisState === "failed") {
    return "분석에 실패했습니다. 다시 분석한 뒤 내용을 확인해 주세요.";
  }
  return "원문에서 보존할 만한 유용한 신호를 찾지 못했습니다.";
};

const isInitiallyVisibleSource = (level: ReviewLevel | null) =>
  level === "safe";

const getQueuePreview = (item: InboxItem) =>
  isInitiallyVisibleSource(item.reviewLevel) &&
  item.sourceAvailable &&
  item.safeSourceText
    ? item.safeSourceText
    : getPrimarySummary(item);

const getInitial = (name: string | null) =>
  (name?.trim().charAt(0) || "?").toLocaleUpperCase("ko-KR");

const getRelativeDate = (value: string | null) => {
  if (!value) return "작성 시각 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "작성 시각 없음";
  const difference = Date.now() - date.getTime();
  if (difference <= 0) return "방금 전";

  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}주 전`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}개월 전`;

  return `${Math.floor(days / 365)}년 전`;
};

const INSIGHT_DESCRIPTIONS: Record<CommentCategory, string> = {
  positive: "긍정적인 반응으로, 현재 운영 방향을 유지하는 데 참고할 수 있습니다.",
  neutral: "명확한 요청이나 위해 신호가 없는 중립적인 반응입니다.",
  question: "답변이 필요한 질문으로, 운영자가 내용을 확인하는 것이 좋습니다.",
  constructive_feedback:
    "사용자의 개선 제안이나 요구사항으로, 제품·서비스 개선에 도움이 됩니다.",
  toxic_but_actionable:
    "거친 표현이 포함됐지만 운영에 참고할 수 있는 요청이 남아 있습니다.",
  abusive_no_signal:
    "운영에 참고할 정보 없이 공격적인 표현이 중심인 댓글입니다.",
  spam_advertisement: "반복 홍보나 무관한 광고 가능성이 있는 댓글입니다.",
  phishing: "외부 이동이나 정보 제공을 유도하는 피싱 가능성이 있습니다.",
  harassment: "특정인을 향한 괴롭힘이나 모욕 가능성이 있는 댓글입니다.",
  threat_or_serious_risk:
    "위협 또는 심각한 위해 가능성이 있어 우선 확인이 필요합니다.",
  uncertain: "판단 근거가 충분하지 않아 운영자의 직접 검토가 필요합니다.",
};

const getInsightDescription = (item: InboxItem) =>
  item.classificationStatus === "review_queue"
    ? BASIS_LABELS[item.classificationTrace?.final?.basis ?? ""] ??
      "판단 근거가 충분하지 않아 직접 확인이 필요합니다."
    : item.category
    ? INSIGHT_DESCRIPTIONS[item.category]
    : "분석이 완료되면 댓글 유형과 운영상 의미를 표시합니다.";

const getCertainty = (item: InboxItem) => {
  if (item.classificationStatus === "review_queue" && item.classificationTrace?.final?.basis.startsWith("classification_")) {
    return "재검토 필요 · AI 응답 검증 오류";
  }
  const trace = item.classificationTrace;
  if (trace?.semantic) return `분석 확신도 ${Math.round(trace.semantic.confidence * 100)}% · 자기보고`;
  const stage = trace?.terra ?? trace?.luna;
  const certainty =
    stage?.status === "succeeded" &&
    typeof stage.output.certainty === "string"
      ? stage.output.certainty
      : null;
  const labels: Record<string, string> = {
    clear: "높음",
    borderline: "경계",
    unclear: "재검토 필요",
  };

  return certainty ? `${labels[certainty] ?? "확인 필요"} · ${certainty}` : "분석 전";
};

const buildParameters = (
  filters: ActiveFilters,
  additions: Record<string, string | null>,
) => {
  const parameters = new URLSearchParams();
  filters.reviewLevels.forEach((level) => parameters.append("levels", level));
  if (filters.classificationStatus) {
    parameters.set("status", filters.classificationStatus);
  }
  if (filters.category) parameters.set("category", filters.category);
  filters.videoIds?.forEach((videoId) => parameters.append("video", videoId));
  if (filters.analysisState) parameters.set("analysis", filters.analysisState);
  if (filters.actionState) parameters.set("action", filters.actionState);
  if (filters.minConfidence !== null && filters.minConfidence !== undefined) {
    parameters.set("minConfidence", String(filters.minConfidence));
  }
  if (filters.maxConfidence !== null && filters.maxConfidence !== undefined) {
    parameters.set("maxConfidence", String(filters.maxConfidence));
  }
  if (filters.search) parameters.set("search", filters.search);
  if (!filters.reviewLevels.length) parameters.set("levels", "");
  if (filters.period) parameters.set("period", filters.period);
  if (filters.sort) parameters.set("sort", filters.sort);
  Object.entries(additions).forEach(([key, value]) => {
    if (value === null) parameters.delete(key);
    else parameters.set(key, value);
  });
  return `/app/inbox?${parameters.toString()}`;
};

function Avatar({
  imageUrl,
  name,
  tone = "blue",
}: {
  imageUrl?: string | null;
  name: string | null;
  tone?: "blue" | "violet" | "coral" | "mint";
}) {
  if (imageUrl) {
    return (
      <Image
        alt={`${name ?? "이름 없는 시청자"} 프로필`}
        className={styles.avatar}
        height={48}
        src={imageUrl}
        unoptimized
        width={48}
      />
    );
  }

  return (
    <span className={`${styles.avatar} ${styles.avatarFallback}`} data-tone={tone} aria-hidden="true">
      {name ? getInitial(name) : <User weight="fill" />}
    </span>
  );
}

function ShiftyAvatar() {
  return (
    <Image
      alt="시프티가 표현을 정리했어요"
      className={styles.shifty}
      height={28}
      src="/brand/shifty-owl-profile.png"
      width={28}
    />
  );
}

function ReviewBadge({
  classificationStatus,
  level,
}: {
  level: ReviewLevel | null;
  classificationStatus?: InboxItem["classificationStatus"];
}) {
  if (classificationStatus === "review_queue") {
    return <span className="review-level review-level-caution">판단 보류</span>;
  }
  if (!level) {
    return <span className="review-level">등급 없음</span>;
  }
  const details = LEVEL_DETAILS[level];
  const Icon = details.icon;
  return (
    <span className={`review-level review-level-${level}`}>
      <Icon aria-hidden="true" weight="fill" />
      {details.label}
    </span>
  );
}

/**
 * 사람이 낮춰 둔 댓글을 AI 가 다시 보고 위험이라고 했을 때만 알린다.
 *
 * 등급을 되돌리지는 않는다. AI 는 추천하고 사람이 정하기 때문이다. 다만 새로
 * 나온 위험 신호를 말없이 삼키면, 사람은 자기가 언제 판단했는지도 잊은 채
 * 그 댓글을 안전한 것으로 계속 본다.
 */
function SupersededRiskNotice({ item }: { item: InboxItem }) {
  if (item.aiReviewLevel !== "risk") return null;
  if (item.reviewLevel === "risk") return null;

  return (
    <p className="inbox-superseded-risk" role="status">
      <ShieldWarning aria-hidden="true" weight="fill" />
      <span>
        <strong>다시 분석했을 때 위험으로 나왔습니다</strong>
        <small>
          회원님이 내린 판단을 그대로 두었습니다. 등급을 다시 볼지는 직접
          정해 주세요.
        </small>
      </span>
    </p>
  );
}

function CorrectionForm({
  correctionAction,
  item,
}: {
  correctionAction: (formData: FormData) => void | Promise<void>;
  item: InboxItem;
}) {
  const isPublicSource = item.sourceKind === "public_url";
  if (
    !item.analysisId ||
    !item.category ||
    (!item.reviewLevel && item.classificationStatus !== "review_queue")
  ) {
    return null;
  }

  return (
    <details className="feedback-correction">
      <summary>
        {isPublicSource ? "AI 판단 수정" : "AI 판단 수정 및 개인화"}
        <CaretDown aria-hidden="true" weight="bold" />
      </summary>
      <form action={correctionAction}>
        <input name="rawCommentId" type="hidden" value={item.rawCommentId} />
        <input name="analysisId" type="hidden" value={item.analysisId} />
        <input
          name="sourceImportJobId"
          type="hidden"
          value={item.sourceImportJobId}
        />
        <input name="decision" type="hidden" value="corrected" />

        <label>
          <span>댓글 유형</span>
          <select defaultValue={item.category} name="correctedCategory">
            {(Object.keys(CATEGORY_LABELS) as CommentCategory[]).map(
              (category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          <span>검토 등급</span>
          <select
            defaultValue={item.reviewLevel ?? ""}
            name="correctedReviewLevel"
            required
          >
            {item.reviewLevel ? null : (
              <option disabled value="">
                등급을 선택해 주세요
              </option>
            )}
            {(Object.keys(LEVEL_DETAILS) as ReviewLevel[]).map((level) => (
              <option key={level} value={level}>
                {LEVEL_DETAILS[level].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>추천 조치</span>
          <select
            defaultValue={item.recommendedAction ?? "review"}
            name="correctedRecommendedAction"
          >
            {(
              Object.keys(RECOMMENDED_ACTION_LABELS) as RecommendedAction[]
            ).map((action) => (
              <option key={action} value={action}>
                {RECOMMENDED_ACTION_LABELS[action]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>순화된 피드백</span>
          <textarea
            defaultValue={item.neutralText ?? item.normalizedQuestion ?? ""}
            name="editedSanitizedFeedback"
            rows={3}
          />
        </label>

        <label><span>수정 이유</span><textarea name="correctionReason" rows={2} maxLength={2000} placeholder="예: 체중 비하가 아니라 칭찬으로 읽히는 이유" /></label>
        <label><span>적용 맥락</span><textarea name="applicationContext" rows={2} maxLength={2000} placeholder="이 판단이 적용되는 상황" /></label>
        {isPublicSource ? (
          <p className="public-feedback-policy">
            공개 URL에서 수집한 판단 수정은 감사 기록으로만 저장하며 개인화에
            사용하지 않습니다.
          </p>
        ) : (
          <>
            <label className="feedback-consent">
              <input
                defaultChecked
                name="useForPersonalization"
                type="checkbox"
                value="true"
              />
              <span>
                <strong>내 기준 개인화에 사용</strong>
                <small>
                  비슷한 새 댓글을 분류할 때 이 판단을 참고합니다. 원하지
                  않으면 선택을 해제할 수 있습니다.
                </small>
              </span>
            </label>
            <label className="feedback-consent">
              <input name="useForTraining" type="checkbox" value="true" />
              <span>
                <strong>향후 공통 모델 학습 후보로 표시</strong>
                <small>표시만 저장하며 지금 학습 API를 호출하지 않습니다.</small>
              </span>
            </label>
          </>
        )}
        <button className="button button-primary" type="submit">
          수정 내용 저장
        </button>
      </form>
    </details>
  );
}

/** 지금 상태에서 아무것도 바꾸지 못하는 조치. 눌러도 50 유닛만 나간다. */
const NO_OP_ACTION: Record<SourceModerationStatus, ModerationAction | null> = {
  published: "publish",
  heldForReview: "hold_for_review",
  rejected: "reject",
  // 유튜브가 붙인 것이라 우리 조치 중 어느 것도 무의미하지 않다.
  likelySpam: null,
};

const STATUS_LABELS: Record<SourceModerationStatus, string> = {
  published: "게시됨",
  heldForReview: "검토 대기",
  rejected: "거절됨",
  likelySpam: "스팸으로 분류됨",
};

function ModerationActions({
  item,
  moderationAction,
}: {
  item: InboxItem;
  moderationAction: (formData: FormData) => void | Promise<void>;
}) {
  if (item.sourceKind === "public_url") {
    return (
      <p className="public-moderation-policy">
        공개 URL 댓글에서 YouTube 조치는 사용할 수 없습니다. 채널 소유자 권한이
        필요합니다.
      </p>
    );
  }
  if (!item.sourceAvailable) return null;

  const status = item.sourceModerationStatus;
  const noOpAction = status ? NO_OP_ACTION[status] : null;

  return (
    <div
      className="inbox-moderation-actions"
      aria-label="YouTube 댓글 조치"
    >
      <p>
        실제 YouTube 조치
        {status ? <span> · 현재 {STATUS_LABELS[status]}</span> : null}
      </p>
      {(
        [
          ["hold_for_review", "검토 대기로 이동"],
          ["publish", "게시 승인"],
          ["reject", "거절하여 숨기기"],
        ] as const
      )
        .filter(([action]) => action !== noOpAction)
        .map(([action, label]) => (
          <form action={moderationAction} key={action}>
            <input
              name="rawCommentId"
              type="hidden"
              value={item.rawCommentId}
            />
            <input
              name="sourceImportJobId"
              type="hidden"
              value={item.sourceImportJobId}
            />
            <button
              className="button button-secondary"
              name="action"
              type="submit"
              value={action}
            >
              {label}
            </button>
          </form>
        ))}
      {item.deleteEligible ? (
        <form action={moderationAction}>
          <input name="rawCommentId" type="hidden" value={item.rawCommentId} />
          <input
            name="sourceImportJobId"
            type="hidden"
            value={item.sourceImportJobId}
          />
          <button
            className="button button-danger"
            name="action"
            type="submit"
            value="delete"
          >
            내 댓글 영구 삭제
          </button>
        </form>
      ) : null}
    </div>
  );
}

export function CommentInbox({
  allowExpressionAction,
  correctionAction,
  rewriteRetryAction,
  data,
  filters,
  moderationAction,
  selectedCommentId,
  videos,
}: {
  data: { items: InboxItem[]; total: number };
  filters: ActiveFilters;
  videos: Array<{ id: string; title: string }>;
  selectedCommentId?: string | null;
  correctionAction: (formData: FormData) => void | Promise<void>;
  rewriteRetryAction?: (formData: FormData) => void | Promise<void>;
  moderationAction: (formData: FormData) => void | Promise<void>;
  allowExpressionAction: (formData: FormData) => void | Promise<void>;
}) {
  const limit = filters.limit ?? 25;
  const offset = filters.offset ?? 0;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(Math.ceil(data.total / limit), 1);

  return (
    <div className={styles.feed}>
      <InboxFilters
        key={JSON.stringify(filters)}
        filters={filters}
        videos={videos}
        categories={Object.entries(CATEGORY_LABELS)}
        analysisStates={Object.entries(ANALYSIS_STATE_LABELS)}
        actionStates={Object.entries(ACTION_STATE_LABELS)}
      />
      {data.items.length === 0 ? (
        <section className={styles.empty} aria-labelledby="inbox-results-title">
          <Circle aria-hidden="true" weight="duotone" />
          <h2 id="inbox-results-title">현재 조건에 맞는 댓글이 없습니다</h2>
          <p>필터를 초기화하거나 다른 영상과 기간을 선택해 주세요.</p>
          <Link href="/app/inbox?levels=safe,caution,risk">필터 초기화</Link>
        </section>
      ) : (
        <section className={styles.list} aria-label={`댓글 ${data.total}개`}>
          <h2 className="sr-only">댓글 {data.total}개</h2>
          {data.items.map((item) => {
            const refined = !(item.reviewLevel === "safe" && item.safeSourceText);
            const title = item.videoTitle ?? videos.find((video) => video.id === item.youtubeVideoId)?.title ?? item.youtubeVideoId;
            return (
              <article className={styles.comment} key={`${item.rawCommentId}:${item.sourceImportJobId}`} id={`comment-${item.rawCommentId}`}>
                <div className={styles.commentAvatar}>
                  <Avatar imageUrl={item.authorAvatarUrl} name={item.authorDisplayName} />
                </div>
                <div className={styles.commentContent}>
                  <header className={styles.author}>
                    <strong>{item.authorDisplayName ?? "이름 없는 시청자"}</strong>
                    <span>· {getRelativeDate(item.publishedAt)}</span>
                    {refined && item.analysisState === "analyzed" ? <ShiftyAvatar /> : null}
                  </header>
                  <p className={`${styles.body} ${refined ? styles.refined : ""}`}>{getQueuePreview(item)}</p>
                  {refined ? (
                    <div className={styles.sourceRow}>
                      {item.sourceAvailable ? (
                        <SourceReveal
                          commentId={item.rawCommentId}
                          label="원문 보기"
                          compact
                          allowExpressionAction={canAllowChannelExpression(item) ? allowExpressionAction : undefined}
                        />
                      ) : <span>원문을 더 이상 불러올 수 없습니다.</span>}
                      <span className={`${styles.warning} ${item.reviewLevel === "risk" ? styles.risk : ""}`}>
                        {item.reviewLevel === "risk" ? <ShieldWarning aria-hidden="true" /> : <Info aria-hidden="true" />}
                        {item.reviewLevel === "risk" ? "위험 댓글 · 내용 보호됨" : item.reviewLevel === "caution" ? "거친 표현 포함" : item.classificationStatus === "review_queue" ? "판단 보류 · 내용 보호됨" : item.analysisState === "analyzed" ? "원문 보호됨" : "분석 전 · 내용 보호됨"}
                      </span>
                    </div>
                  ) : null}
                  {item.classificationTrace?.semantic?.criticalHarm ? <p className={styles.warning}>중대한 공격 신호 있음 · 등급과 별도</p> : null}
                  {item.classificationTrace?.semantic?.spamSignals.length ? <p className={styles.warning}>스팸 의심 · 등급과 별도</p> : null}
                  {item.classificationTrace?.semantic?.rewriteStatus === "failed" && rewriteRetryAction && item.analysisId ? <form action={rewriteRetryAction}><input type="hidden" name="verdictId" value={item.analysisId}/><button type="submit">피드백 정리 재시도</button></form> : null}
                  <SupersededRiskNotice item={item} />
                  <div className={`${styles.reactions} ${item.replyCount > 0 ? styles.hasReplies : ""}`}>
                    <span aria-label={`좋아요 ${item.likeCount}`}><ThumbsUp aria-hidden="true" />{item.likeCount}</span>
                    {item.replyCount === 0 ? <span className={styles.noReplies}><ChatCircleDots aria-hidden="true" />답글 0개</span> : null}
                    {item.sourceKind === "public_url" ? <span className={styles.readonly}>공개 URL · 읽기 전용</span> : null}
                  </div>
                  {item.replyCount > 0 ? (
                    <details className={styles.replies} open={selectedCommentId === item.rawCommentId || undefined}>
                      <summary><ChatCircleDots aria-hidden="true" />답글 보기 ({item.replyCount})<CaretDown aria-hidden="true" /></summary>
                      <div className={styles.replyList}>
                        {item.replies.map((reply) => {
                          const safe = reply.reviewLevel === "safe" && reply.sourceAvailable && reply.safeSourceText;
                          return (
                            <article key={reply.rawCommentId} className={styles.reply}>
                              <Avatar imageUrl={reply.authorAvatarUrl} name={reply.authorDisplayName} />
                              <div>
                                <header className={styles.author}><strong>{reply.authorDisplayName ?? "이름 없는 시청자"}</strong><span>· {getRelativeDate(reply.publishedAt)}</span></header>
                                <p>{safe ? reply.safeSourceText : reply.neutralText ?? reply.normalizedQuestion ?? "안전 검토 전까지 답글 원문을 표시하지 않습니다."}</p>
                                {!safe && reply.sourceAvailable ? <SourceReveal commentId={reply.rawCommentId} label="답글 원문 보기" compact /> : null}
                                <span className={styles.replyLikes}><ThumbsUp aria-hidden="true" />{reply.likeCount}</span>
                              </div>
                            </article>
                          );
                        })}
                        {item.replies.length === 0 ? <p>아직 저장된 대댓글이 없습니다.</p> : null}
                      </div>
                    </details>
                  ) : null}
                </div>
                <a className={styles.video} href={`https://www.youtube.com/watch?v=${encodeURIComponent(item.youtubeVideoId)}`} target="_blank" rel="noreferrer" aria-label={`${title} YouTube에서 보기`}>
                  {item.videoThumbnailUrl ? <Image alt={`${title} 썸네일`} width={110} height={67} src={item.videoThumbnailUrl} unoptimized /> : null}
                  <span>{title}</span>
                </a>
                <details className={styles.review} open={selectedCommentId === item.rawCommentId || undefined}>
                  <summary aria-label="댓글 검토 및 조치"><DotsThreeVertical aria-hidden="true" weight="bold" /><span className="sr-only">댓글 검토 및 조치</span></summary>
                  <div className={styles.reviewContent}>
                    <h3>댓글 검토</h3>
                    <ReviewBadge classificationStatus={item.classificationStatus} level={item.reviewLevel} />
                    <p>{getInsightDescription(item)}</p>
                    <dl className={styles.facts}>
                      <div><dt>댓글 유형</dt><dd>{item.category ? CATEGORY_LABELS[item.category] : "분석 전"}</dd></div>
                      <div><dt>확실성</dt><dd>{getCertainty(item)}</dd></div>
                      <div><dt>추천</dt><dd>{item.recommendedAction ? RECOMMENDED_ACTION_LABELS[item.recommendedAction] : "분석 전"}</dd></div>
                      <div><dt>조치 상태</dt><dd>{item.actionState ? ACTION_STATE_LABELS[item.actionState] : "아직 요청 없음"}</dd></div>
                    </dl>
                    {item.classificationTrace ? <ClassificationTrace trace={item.classificationTrace} /> : null}
                    <CorrectionForm correctionAction={correctionAction} item={item} />
                    <ModerationActions item={item} moderationAction={moderationAction} />
                  </div>
                </details>
              </article>
            );
          })}
        </section>
      )}

      {data.items.length > 0 && totalPages > 1 ? (
        <nav className="inbox-pagination" aria-label="댓글 페이지">
          {currentPage > 1 ? (
            <Link
              href={buildParameters(filters, {
                page: String(currentPage - 1),
                selected: null,
              })}
            >
              <CaretLeft aria-hidden="true" weight="bold" />
              이전 페이지
            </Link>
          ) : (
            <span />
          )}
          <strong>
            {currentPage} / {totalPages}
          </strong>
          {currentPage < totalPages ? (
            <Link
              href={buildParameters(filters, {
                page: String(currentPage + 1),
                selected: null,
              })}
            >
              다음 페이지
              <CaretRight aria-hidden="true" weight="bold" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
