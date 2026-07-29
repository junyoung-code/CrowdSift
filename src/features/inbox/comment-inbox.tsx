import {
  CaretDown,
  CaretLeft,
  CaretRight,
  ChatCircleDots,
  CheckCircle,
  Circle,
  Funnel,
  Heart,
  LockKey,
  MagnifyingGlass,
  PaperPlaneRight,
  ShieldWarning,
  SlidersHorizontal,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";

import type {
  CommentCategory,
  RecommendedAction,
  ReviewLevel,
} from "@/features/analysis/contracts";

import { CommentSourceBlock } from "./comment-source-block";
import type {
  InboxActionState,
  InboxAnalysisState,
  InboxItem,
  InboxReply,
} from "./inbox-query";
import { SourceReveal } from "./source-reveal";

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
  uncertain: "판단 어려움",
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

type ActiveFilters = {
  reviewLevels: ReviewLevel[];
  category?: CommentCategory | null;
  videoId?: string | null;
  analysisState?: InboxAnalysisState | null;
  actionState?: InboxActionState | null;
  minConfidence?: number | null;
  maxConfidence?: number | null;
  search?: string | null;
  limit?: number;
  offset?: number;
};

const getPrimarySummary = (item: InboxItem) => {
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

const getReplySummary = (reply: InboxReply) =>
  reply.safeSourceText ??
  reply.neutralText ??
  reply.normalizedQuestion ??
  "안전 검토 전까지 답글 원문을 표시하지 않습니다.";

const isInitiallyVisibleSource = (level: ReviewLevel | null) =>
  level === "safe" || level === "caution";

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
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(date);
};

const buildParameters = (
  filters: ActiveFilters,
  additions: Record<string, string | null>,
) => {
  const parameters = new URLSearchParams();
  filters.reviewLevels.forEach((level) => parameters.append("levels", level));
  if (filters.category) parameters.set("category", filters.category);
  if (filters.videoId) parameters.set("video", filters.videoId);
  if (filters.analysisState) parameters.set("analysis", filters.analysisState);
  if (filters.actionState) parameters.set("action", filters.actionState);
  if (filters.minConfidence !== null && filters.minConfidence !== undefined) {
    parameters.set("minConfidence", String(filters.minConfidence));
  }
  if (filters.maxConfidence !== null && filters.maxConfidence !== undefined) {
    parameters.set("maxConfidence", String(filters.maxConfidence));
  }
  if (filters.search) parameters.set("search", filters.search);
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
        className="inbox-avatar inbox-avatar-image"
        height={35}
        src={imageUrl}
        unoptimized
        width={35}
      />
    );
  }

  return (
    <span className={`inbox-avatar inbox-avatar-${tone}`} aria-hidden="true">
      {getInitial(name)}
    </span>
  );
}

function ReviewBadge({ level }: { level: ReviewLevel | null }) {
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

function CorrectionForm({
  correctionAction,
  item,
}: {
  correctionAction: (formData: FormData) => void | Promise<void>;
  item: InboxItem;
}) {
  const isPublicSource = item.sourceKind === "public_url";
  if (!item.analysisId || !item.category || !item.reviewLevel) return null;

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
            defaultValue={item.reviewLevel}
            name="correctedReviewLevel"
          >
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

        {isPublicSource ? (
          <p className="public-feedback-policy">
            공개 URL에서 수집한 판단 수정은 감사 기록으로만 저장하며 개인화에
            사용하지 않습니다.
          </p>
        ) : (
          <>
            <label className="feedback-consent">
              <input
                name="useForPersonalization"
                type="checkbox"
                value="true"
              />
              <span>
                <strong>내 기준 개인화에 사용</strong>
                <small>
                  같은 workspace의 비슷한 댓글을 판단할 때만 활용합니다.
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

  return (
    <div
      className="inbox-moderation-actions"
      aria-label="YouTube 댓글 조치"
    >
      <p>실제 YouTube 조치</p>
      {(
        [
          ["hold_for_review", "검토 대기로 이동"],
          ["publish", "게시 승인"],
          ["reject", "거절하여 숨기기"],
        ] as const
      ).map(([action, label]) => (
        <form action={moderationAction} key={action}>
          <input name="rawCommentId" type="hidden" value={item.rawCommentId} />
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
  correctionAction,
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
  moderationAction: (formData: FormData) => void | Promise<void>;
}) {
  const selectedItem =
    data.items.find((item) => item.rawCommentId === selectedCommentId) ??
    data.items[0] ??
    null;
  const limit = filters.limit ?? 25;
  const offset = filters.offset ?? 0;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(Math.ceil(data.total / limit), 1);
  const selectedIsPublic = selectedItem?.sourceKind === "public_url";

  return (
    <div className="comment-inbox">
      <section className="inbox-toolbar" aria-label="댓글 필터">
        <div className="inbox-toolbar-heading">
          <span aria-hidden="true">
            <SlidersHorizontal weight="duotone" />
          </span>
          <div>
            <p>COMMENT OPERATIONS</p>
            <h2>댓글 운영 워크스페이스</h2>
          </div>
        </div>

        <form action="/app/inbox" className="inbox-filter-form" method="get">
          <label className="inbox-search-field">
            <span className="sr-only">댓글 검색</span>
            <span>
              <MagnifyingGlass aria-hidden="true" />
              <input
                defaultValue={filters.search ?? ""}
                name="search"
                placeholder="댓글, 작성자, 정제된 피드백 검색"
                type="search"
              />
            </span>
          </label>

          <fieldset className="inbox-level-filters">
            <legend className="sr-only">검토 등급</legend>
            {(Object.keys(LEVEL_DETAILS) as ReviewLevel[]).map((level) => {
              const details = LEVEL_DETAILS[level];
              const Icon = details.icon;
              return (
                <label key={level}>
                  <input
                    defaultChecked={filters.reviewLevels.includes(level)}
                    name="levels"
                    type="checkbox"
                    value={level}
                  />
                  <Icon aria-hidden="true" weight="fill" />
                  {details.filterLabel}
                </label>
              );
            })}
          </fieldset>

          <details className="inbox-advanced-filters">
            <summary>
              상세 필터
              <CaretDown aria-hidden="true" weight="bold" />
            </summary>
            <div className="inbox-select-filters">
              <label>
                <span>댓글 유형</span>
                <select defaultValue={filters.category ?? ""} name="category">
                  <option value="">전체 유형</option>
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
                <span>영상</span>
                <select defaultValue={filters.videoId ?? ""} name="video">
                  <option value="">전체 영상</option>
                  {videos.map((video) => (
                    <option key={video.id} value={video.id}>
                      {video.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>분석 상태</span>
                <select
                  defaultValue={filters.analysisState ?? ""}
                  name="analysis"
                >
                  <option value="">전체 분석 상태</option>
                  {(
                    Object.keys(
                      ANALYSIS_STATE_LABELS,
                    ) as InboxAnalysisState[]
                  ).map((state) => (
                    <option key={state} value={state}>
                      {ANALYSIS_STATE_LABELS[state]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>조치 상태</span>
                <select defaultValue={filters.actionState ?? ""} name="action">
                  <option value="">전체 조치 상태</option>
                  {(
                    Object.keys(ACTION_STATE_LABELS) as InboxActionState[]
                  ).map((state) => (
                    <option key={state} value={state}>
                      {ACTION_STATE_LABELS[state]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>최소 신뢰도</span>
                <input
                  defaultValue={filters.minConfidence ?? ""}
                  max="1"
                  min="0"
                  name="minConfidence"
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                />
              </label>
              <label>
                <span>최대 신뢰도</span>
                <input
                  defaultValue={filters.maxConfidence ?? ""}
                  max="1"
                  min="0"
                  name="maxConfidence"
                  placeholder="1.00"
                  step="0.01"
                  type="number"
                />
              </label>
            </div>
          </details>

          <button className="button button-primary" type="submit">
            <Funnel aria-hidden="true" weight="fill" />
            적용
          </button>
        </form>
      </section>

      {data.items.length === 0 ? (
        <section className="inbox-results" aria-labelledby="inbox-results-title">
          <div className="inbox-empty-state">
            <Circle aria-hidden="true" weight="duotone" />
            <h3 id="inbox-results-title">현재 조건에 맞는 댓글이 없습니다</h3>
            <p>
              다른 등급이나 분석 상태를 선택하거나, 새 댓글을 가져온 뒤 다시
              확인해 주세요.
            </p>
          </div>
        </section>
      ) : (
        <div className="inbox-workspace">
          <aside className="inbox-queue" aria-label={`댓글 ${data.total}개`}>
            <header>
              <div>
                <p>INBOX</p>
                <h2>댓글 {data.total}개</h2>
              </div>
              <span>최신순</span>
            </header>

            <div className="inbox-comment-list">
              {data.items.map((item, index) => {
                const isSelected =
                  selectedItem?.rawCommentId === item.rawCommentId;
                const itemHref = buildParameters(filters, {
                  selected: item.rawCommentId,
                  page: String(currentPage),
                });
                return (
                  <article
                    className={`inbox-queue-item ${
                      isSelected ? "is-selected" : ""
                    }`}
                    key={`${item.rawCommentId}:${item.sourceImportJobId}`}
                  >
                    <Link
                      className="inbox-queue-select"
                      href={itemHref}
                      aria-current={isSelected ? "true" : undefined}
                    >
                      <Avatar
                        imageUrl={item.authorAvatarUrl}
                        name={item.authorDisplayName}
                        tone={
                          (["blue", "violet", "coral", "mint"] as const)[
                            index % 4
                          ]
                        }
                      />
                      <span>
                        <strong>
                          {item.authorDisplayName ?? "이름 없는 시청자"}
                        </strong>
                        <small>{getRelativeDate(item.publishedAt)}</small>
                      </span>
                    </Link>
                    <p className="inbox-sanitized-feedback">
                      {getQueuePreview(item)}
                    </p>
                    <div className="inbox-queue-item-meta">
                      <span>
                        <Heart aria-hidden="true" />
                        {item.likeCount}
                      </span>
                      <ReviewBadge level={item.reviewLevel} />
                    </div>
                    <Link className="inbox-reply-disclosure" href={itemHref}>
                      <ChatCircleDots aria-hidden="true" weight="fill" />
                      답글 {item.replyCount}개 보기
                    </Link>
                  </article>
                );
              })}
            </div>
          </aside>

          {selectedItem ? (
            <>
              <section
                className="inbox-conversation"
                aria-labelledby="conversation-title"
              >
                <header>
                  <div>
                    <p>CONVERSATION</p>
                    <h2 id="conversation-title">댓글 대화</h2>
                  </div>
                  <div className="inbox-conversation-video">
                    {selectedItem.videoThumbnailUrl ? (
                      <Image
                        alt={`${
                          selectedItem.videoTitle ?? "선택한 영상"
                        } 썸네일`}
                        height={32}
                        src={selectedItem.videoThumbnailUrl}
                        unoptimized
                        width={52}
                      />
                    ) : null}
                    <span>
                      {selectedItem.videoTitle ??
                        videos.find(
                          (video) => video.id === selectedItem.youtubeVideoId,
                        )?.title ??
                        selectedItem.youtubeVideoId}
                    </span>
                  </div>
                </header>

                <div className="inbox-thread">
                  <article className="inbox-thread-comment">
                    <div className="inbox-thread-author">
                      <Avatar
                        imageUrl={selectedItem.authorAvatarUrl}
                        name={selectedItem.authorDisplayName}
                        tone="blue"
                      />
                      <div>
                        <strong>
                          {selectedItem.authorDisplayName ??
                            "이름 없는 시청자"}
                        </strong>
                        <span>{getRelativeDate(selectedItem.publishedAt)}</span>
                      </div>
                      <ReviewBadge level={selectedItem.reviewLevel} />
                    </div>

                    {isInitiallyVisibleSource(selectedItem.reviewLevel) &&
                    selectedItem.sourceAvailable &&
                    selectedItem.safeSourceText ? (
                      <CommentSourceBlock
                        authorAvatarUrl={selectedItem.authorAvatarUrl}
                        authorDisplayName={selectedItem.authorDisplayName}
                        publishedAt={selectedItem.publishedAt}
                        textDisplay={selectedItem.safeSourceText}
                      />
                    ) : (
                      <div className="inbox-protected-source">
                        <span>
                          <Sparkle aria-hidden="true" weight="fill" />
                          AI가 정리한 핵심
                        </span>
                        <p>{getPrimarySummary(selectedItem)}</p>
                        {selectedItem.sourceAvailable ? (
                          <SourceReveal commentId={selectedItem.rawCommentId} />
                        ) : (
                          <p className="source-unavailable">
                            YouTube에서 더 이상 원문을 확인할 수 없습니다.
                          </p>
                        )}
                      </div>
                    )}

                    <div className="inbox-thread-reactions">
                      <span>
                        <Heart aria-hidden="true" />
                        좋아요 {selectedItem.likeCount}
                      </span>
                      <span>
                        <ChatCircleDots aria-hidden="true" />
                        답글 {selectedItem.replyCount}
                      </span>
                    </div>
                  </article>

                  {selectedItem.replies.length > 0 ? (
                    <div
                      className="inbox-thread-replies"
                      aria-label={`대댓글 ${selectedItem.replyCount}개`}
                    >
                      {selectedItem.replies.map((reply, index) => (
                        <article
                          className="inbox-thread-reply"
                          key={reply.rawCommentId}
                        >
                          <Avatar
                            imageUrl={reply.authorAvatarUrl}
                            name={reply.authorDisplayName}
                            tone={index % 2 === 0 ? "violet" : "mint"}
                          />
                          <div>
                            <header>
                              <strong>
                                {reply.authorDisplayName ?? "이름 없는 시청자"}
                              </strong>
                              <span>{getRelativeDate(reply.publishedAt)}</span>
                            </header>
                            {isInitiallyVisibleSource(reply.reviewLevel) &&
                            reply.sourceAvailable &&
                            reply.safeSourceText ? (
                              <p>{reply.safeSourceText}</p>
                            ) : (
                              <>
                                <p>{getReplySummary(reply)}</p>
                                {reply.reviewLevel === "risk" &&
                                reply.sourceAvailable ? (
                                  <SourceReveal
                                    commentId={reply.rawCommentId}
                                    label="위험 답글 원문 확인"
                                  />
                                ) : null}
                              </>
                            )}
                            <span className="inbox-reply-like">
                              <Heart aria-hidden="true" />
                              {reply.likeCount}
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="inbox-no-replies">
                      <ChatCircleDots aria-hidden="true" weight="duotone" />
                      <p>아직 저장된 대댓글이 없습니다.</p>
                    </div>
                  )}
                </div>

                <div className="inbox-locked-composer">
                  <div>
                    <LockKey aria-hidden="true" weight="fill" />
                    <p>
                      답글 작성은 YouTube 게시·증거 저장 구현 후 사용할 수
                      있습니다.
                    </p>
                  </div>
                  <label>
                    <span className="sr-only">답글 작성</span>
                    <textarea
                      disabled
                      placeholder="답글 작성 준비 중"
                      rows={2}
                    />
                  </label>
                  <button className="button button-primary" disabled type="button">
                    <PaperPlaneRight aria-hidden="true" weight="fill" />
                    답글 보내기
                  </button>
                </div>
              </section>

              <aside className="inbox-insights" aria-label="선택한 댓글 분석">
                <header>
                  <div>
                    <p>AI ANALYSIS</p>
                    <h2>운영 인사이트</h2>
                  </div>
                  <Sparkle aria-hidden="true" weight="duotone" />
                </header>

                <div className="inbox-insight-summary">
                  <ReviewBadge level={selectedItem.reviewLevel} />
                  <strong>{getPrimarySummary(selectedItem)}</strong>
                  <span>
                    {ANALYSIS_STATE_LABELS[selectedItem.analysisState]}
                  </span>
                </div>

                <dl className="inbox-analysis-facts">
                  <div>
                    <dt>댓글 유형</dt>
                    <dd>
                      {selectedItem.category
                        ? CATEGORY_LABELS[selectedItem.category]
                        : "분석 전"}
                    </dd>
                  </div>
                  <div>
                    <dt>신뢰도</dt>
                    <dd>
                      {selectedItem.confidence === null
                        ? "—"
                        : `${Math.round(selectedItem.confidence * 100)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt>추천</dt>
                    <dd>
                      {selectedItem.recommendedAction
                        ? RECOMMENDED_ACTION_LABELS[
                            selectedItem.recommendedAction
                          ]
                        : "분석 전"}
                    </dd>
                  </div>
                  <div>
                    <dt>조치 상태</dt>
                    <dd>
                      {selectedItem.actionState
                        ? ACTION_STATE_LABELS[selectedItem.actionState]
                        : "아직 요청 없음"}
                    </dd>
                  </div>
                </dl>

                <div className="inbox-observation-badges">
                  <span
                    className={`source-kind-badge ${
                      selectedIsPublic ? "is-public" : "is-owned"
                    }`}
                  >
                    {selectedIsPublic ? "공개 URL" : "내 채널"}
                  </span>
                  {selectedIsPublic ? (
                    <span className="source-readonly-badge">읽기 전용</span>
                  ) : null}
                </div>

                <CorrectionForm
                  correctionAction={correctionAction}
                  item={selectedItem}
                />
                <ModerationActions
                  item={selectedItem}
                  moderationAction={moderationAction}
                />
              </aside>
            </>
          ) : null}
        </div>
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
