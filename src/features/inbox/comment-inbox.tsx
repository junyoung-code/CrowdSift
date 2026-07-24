import {
  CheckCircle,
  CaretLeft,
  CaretRight,
  Circle,
  Funnel,
  MagnifyingGlass,
  ShieldWarning,
  SlidersHorizontal,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import type {
  CommentCategory,
  RecommendedAction,
  ReviewLevel,
} from "@/features/analysis/contracts";

import type {
  InboxActionState,
  InboxAnalysisState,
  InboxItem,
} from "./inbox-query";
import { CommentSourceBlock } from "./comment-source-block";
import { SourceReveal } from "./source-reveal";

const LEVEL_DETAILS: Record<
  ReviewLevel,
  {
    label: string;
    filterLabel: string;
    icon: typeof CheckCircle;
  }
> = {
  safe: {
    label: "안전",
    filterLabel: "안전 댓글",
    icon: CheckCircle,
  },
  caution: {
    label: "주의",
    filterLabel: "주의 댓글",
    icon: WarningCircle,
  },
  risk: {
    label: "위험",
    filterLabel: "위험 댓글",
    icon: ShieldWarning,
  },
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

export function CommentInbox({
  correctionAction,
  data,
  filters,
  moderationAction,
  videos,
}: {
  data: { items: InboxItem[]; total: number };
  filters: ActiveFilters;
  videos: Array<{ id: string; title: string }>;
  correctionAction: (formData: FormData) => void | Promise<void>;
  moderationAction: (formData: FormData) => void | Promise<void>;
}) {
  const videoTitleById = new Map(
    videos.map((video) => [video.id, video.title]),
  );
  const limit = filters.limit ?? 25;
  const offset = filters.offset ?? 0;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(Math.ceil(data.total / limit), 1);
  const pageHref = (page: number) => {
    const parameters = new URLSearchParams();
    filters.reviewLevels.forEach((level) =>
      parameters.append("levels", level),
    );
    if (filters.category) parameters.set("category", filters.category);
    if (filters.videoId) parameters.set("video", filters.videoId);
    if (filters.analysisState) {
      parameters.set("analysis", filters.analysisState);
    }
    if (filters.actionState) parameters.set("action", filters.actionState);
    if (filters.minConfidence !== null && filters.minConfidence !== undefined) {
      parameters.set("minConfidence", String(filters.minConfidence));
    }
    if (filters.maxConfidence !== null && filters.maxConfidence !== undefined) {
      parameters.set("maxConfidence", String(filters.maxConfidence));
    }
    if (filters.search) parameters.set("search", filters.search);
    parameters.set("page", String(page));
    return `/app/inbox?${parameters.toString()}`;
  };

  return (
    <div className="comment-inbox">
      <section className="inbox-toolbar" aria-label="댓글 필터">
        <div className="inbox-toolbar-heading">
          <span aria-hidden="true">
            <SlidersHorizontal weight="duotone" />
          </span>
          <div>
            <p>REVIEW QUEUE</p>
            <h2>검토할 댓글 찾기</h2>
          </div>
        </div>

        <form action="/app/inbox" className="inbox-filter-form" method="get">
          <label className="inbox-search-field">
            <span>댓글 검색</span>
            <span>
              <MagnifyingGlass aria-hidden="true" />
              <input
                defaultValue={filters.search ?? ""}
                name="search"
                placeholder="정제된 피드백, 질문 또는 원문 검색"
                type="search"
              />
            </span>
          </label>

          <fieldset className="inbox-level-filters">
            <legend>검토 등급</legend>
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
                {(Object.keys(ANALYSIS_STATE_LABELS) as InboxAnalysisState[]).map(
                  (state) => (
                    <option key={state} value={state}>
                      {ANALYSIS_STATE_LABELS[state]}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              <span>조치 상태</span>
              <select defaultValue={filters.actionState ?? ""} name="action">
                <option value="">전체 조치 상태</option>
                {(Object.keys(ACTION_STATE_LABELS) as InboxActionState[]).map(
                  (state) => (
                    <option key={state} value={state}>
                      {ACTION_STATE_LABELS[state]}
                    </option>
                  ),
                )}
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

          <button className="button button-primary" type="submit">
            <Funnel aria-hidden="true" weight="fill" />
            필터 적용
          </button>
        </form>
      </section>

      <section className="inbox-results" aria-labelledby="inbox-results-title">
        <header>
          <div>
            <p>COMMENT INBOX</p>
            <h2 id="inbox-results-title">댓글 {data.total}개</h2>
          </div>
          <span>주의·위험 원문은 확인 전까지 화면에 포함하지 않습니다</span>
        </header>

        {data.items.length === 0 ? (
          <div className="inbox-empty-state">
            <span aria-hidden="true">
              <Circle weight="duotone" />
            </span>
            <h3>현재 조건에 맞는 댓글이 없습니다</h3>
            <p>
              다른 등급이나 분석 상태를 선택하거나, 새 댓글을 가져온 뒤 다시
              확인해 주세요.
            </p>
          </div>
        ) : (
          <div className="inbox-comment-list">
            {data.items.map((item) => {
              const levelDetails = item.reviewLevel
                ? LEVEL_DETAILS[item.reviewLevel]
                : null;
              const LevelIcon = levelDetails?.icon ?? Circle;
              const isPublicSource = item.sourceKind === "public_url";
              const showSafeSource =
                item.reviewLevel === "safe" &&
                item.sourceAvailable &&
                item.safeSourceText !== null;
              const safeSourceText = showSafeSource
                ? item.safeSourceText
                : null;

              return (
                <article
                  className="inbox-comment-card"
                  key={`${item.rawCommentId}:${item.sourceImportJobId}`}
                >
                  <div className="inbox-comment-summary">
                    <div className="inbox-comment-meta">
                      <div>
                        <strong>
                          {item.authorDisplayName ?? "이름 없는 시청자"}
                        </strong>
                        <span>
                          {videoTitleById.get(item.youtubeVideoId) ??
                            item.youtubeVideoId}
                        </span>
                      </div>
                      <div>
                        <span
                          className={`source-kind-badge ${
                            isPublicSource ? "is-public" : "is-owned"
                          }`}
                        >
                          {isPublicSource ? "공개 URL" : "내 채널"}
                        </span>
                        {isPublicSource ? (
                          <span className="source-readonly-badge">
                            읽기 전용
                          </span>
                        ) : null}
                        {levelDetails ? (
                          <span
                            className={`review-level review-level-${item.reviewLevel}`}
                          >
                            <LevelIcon aria-hidden="true" weight="fill" />
                            {levelDetails.label}
                          </span>
                        ) : (
                          <span className="review-level">
                            <Circle aria-hidden="true" />
                            등급 없음
                          </span>
                        )}
                        <span className="analysis-state">
                          {ANALYSIS_STATE_LABELS[item.analysisState]}
                        </span>
                      </div>
                    </div>

                    {safeSourceText !== null ? (
                      <CommentSourceBlock
                        authorAvatarUrl={item.authorAvatarUrl}
                        authorDisplayName={item.authorDisplayName}
                        publishedAt={item.publishedAt}
                        textDisplay={safeSourceText}
                      />
                    ) : (
                      <>
                        <p className="inbox-sanitized-feedback">
                          {getPrimarySummary(item)}
                        </p>
                        {item.sourceAvailable ? (
                          <SourceReveal commentId={item.rawCommentId} />
                        ) : (
                          <p className="source-unavailable">
                            YouTube에서 더 이상 원문을 확인할 수 없습니다.
                          </p>
                        )}
                      </>
                    )}

                    <dl className="inbox-analysis-facts">
                      <div>
                        <dt>댓글 유형</dt>
                        <dd>
                          {item.category
                            ? CATEGORY_LABELS[item.category]
                            : "분석 전"}
                        </dd>
                      </div>
                      <div>
                        <dt>신뢰도</dt>
                        <dd>
                          {item.confidence === null
                            ? "—"
                            : `${Math.round(item.confidence * 100)}%`}
                        </dd>
                      </div>
                      <div>
                        <dt>추천</dt>
                        <dd>
                          {item.recommendedAction
                            ? RECOMMENDED_ACTION_LABELS[
                                item.recommendedAction
                              ]
                            : "분석 전"}
                        </dd>
                      </div>
                      <div>
                        <dt>조치 상태</dt>
                        <dd>
                          {item.actionState
                            ? ACTION_STATE_LABELS[item.actionState]
                            : "아직 요청 없음"}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="inbox-comment-controls">
                    {item.analysisId && item.category && item.reviewLevel ? (
                      <details className="feedback-correction">
                        <summary>
                          {isPublicSource ? "판단 수정" : "판단 수정 및 개인화"}
                        </summary>
                        <form action={correctionAction}>
                          <input
                            name="rawCommentId"
                            type="hidden"
                            value={item.rawCommentId}
                          />
                          <input
                            name="analysisId"
                            type="hidden"
                            value={item.analysisId}
                          />
                          <input
                            name="sourceImportJobId"
                            type="hidden"
                            value={item.sourceImportJobId}
                          />
                          <input
                            name="decision"
                            type="hidden"
                            value="corrected"
                          />

                          <label>
                            <span>댓글 유형</span>
                            <select
                              defaultValue={item.category}
                              name="correctedCategory"
                            >
                              {(
                                Object.keys(
                                  CATEGORY_LABELS,
                                ) as CommentCategory[]
                              ).map((category) => (
                                <option key={category} value={category}>
                                  {CATEGORY_LABELS[category]}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            <span>검토 등급</span>
                            <select
                              defaultValue={item.reviewLevel}
                              name="correctedReviewLevel"
                            >
                              {(Object.keys(LEVEL_DETAILS) as ReviewLevel[]).map(
                                (level) => (
                                  <option key={level} value={level}>
                                    {LEVEL_DETAILS[level].label}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>

                          <label>
                            <span>추천 조치</span>
                            <select
                              defaultValue={item.recommendedAction ?? "review"}
                              name="correctedRecommendedAction"
                            >
                              {(
                                Object.keys(
                                  RECOMMENDED_ACTION_LABELS,
                                ) as RecommendedAction[]
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
                              defaultValue={
                                item.neutralText ??
                                item.normalizedQuestion ??
                                ""
                              }
                              name="editedSanitizedFeedback"
                              rows={3}
                            />
                          </label>

                          {isPublicSource ? (
                            <p className="public-feedback-policy">
                              공개 URL에서 수집한 댓글의 판단 수정은 감사 기록으로만
                              저장합니다. 개인화 RAG와 향후 모델 학습에는 사용하지
                              않습니다.
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
                                    같은 workspace의 비슷한 댓글을 판단할 때만
                                    활용합니다.
                                  </small>
                                </span>
                              </label>

                              <label className="feedback-consent">
                                <input
                                  name="useForTraining"
                                  type="checkbox"
                                  value="true"
                                />
                                <span>
                                  <strong>향후 공통 모델 학습 후보로 표시</strong>
                                  <small>
                                    표시만 저장하며 지금 학습 API를 호출하지
                                    않습니다.
                                  </small>
                                </span>
                              </label>
                            </>
                          )}

                          <button className="button button-primary" type="submit">
                            수정 내용 저장
                          </button>
                        </form>
                      </details>
                    ) : null}

                    {isPublicSource ? (
                      <p className="public-moderation-policy">
                        공개 URL 댓글에서 YouTube 조치는 사용할 수 없습니다.
                        숨김·삭제는 해당 채널 소유자의 권한이 필요합니다.
                      </p>
                    ) : item.sourceAvailable ? (
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
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {data.items.length > 0 && totalPages > 1 ? (
          <nav className="inbox-pagination" aria-label="댓글 페이지">
            {currentPage > 1 ? (
              <Link href={pageHref(currentPage - 1)}>
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
              <Link href={pageHref(currentPage + 1)}>
                다음 페이지
                <CaretRight aria-hidden="true" weight="bold" />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
