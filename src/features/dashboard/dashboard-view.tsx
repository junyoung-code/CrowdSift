import {
  ArrowRight,
  ChartBar,
  ChatCircleDots,
  CheckCircle,
  Clock,
  FilmStrip,
  LinkSimple,
  ShieldCheck,
  ShieldWarning,
  Sparkle,
  WarningCircle,
  YoutubeLogo,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import type { DashboardData } from "./dashboard-query";

export type { DashboardData } from "./dashboard-query";

const JOB_STATUS_LABELS: Record<string, string> = {
  pending: "대기 중",
  running: "진행 중",
  partially_succeeded: "일부 완료",
  succeeded: "완료",
  failed: "실패",
};

const ACTION_LABELS: Record<string, string> = {
  hold_for_review: "검토 대기로 이동",
  publish: "공개",
  reject: "숨김",
  delete: "영구 삭제",
};

const ACTION_STATE_LABELS: Record<string, string> = {
  pending_confirmation: "사용자 확인 대기",
  awaiting_scope: "추가 권한 필요",
  running: "처리 중",
  succeeded: "완료",
  failed: "실패",
  cancelled: "취소",
};

const CATEGORY_LABELS: Record<string, string> = {
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

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

function DashboardEmptyState({
  connectedChannel,
}: {
  connectedChannel?: string;
}) {
  return (
    <section className="connection-empty-state dashboard-empty-state">
      <span
        className={`empty-state-icon${connectedChannel ? " is-connected" : ""}`}
        aria-hidden="true"
      >
        {connectedChannel ? (
          <LinkSimple weight="bold" />
        ) : (
          <YoutubeLogo weight="fill" />
        )}
      </span>
      <p>{connectedChannel ? "채널 연결 완료" : "첫 번째 단계"}</p>
      <h2>
        {connectedChannel
          ? "영상 하나를 선택해 첫 댓글을 가져오세요"
          : "YouTube 채널을 연결해 첫 댓글을 가져오세요"}
      </h2>
      <span>
        {connectedChannel
          ? `${connectedChannel} 채널의 실제 댓글을 가져오기 전에는 통계 수치를 표시하지 않습니다.`
          : "CommentHawk 로그인과 YouTube 권한은 별도로 관리됩니다. 먼저 읽기 권한으로 크리에이터 소유 채널을 선택합니다."}
      </span>
      <Link
        className="button button-primary"
        href={connectedChannel ? "/app/videos" : "/app/connect/youtube"}
      >
        {connectedChannel ? "첫 댓글 가져오기" : "YouTube 연결하기"}
        <ArrowRight aria-hidden="true" weight="bold" />
      </Link>
    </section>
  );
}

function JobCard({
  icon: Icon,
  job,
  title,
}: {
  icon: typeof Clock;
  job: Extract<DashboardData, { state: "ready" }>["latestImport"];
  title: string;
}) {
  return (
    <article className="dashboard-job-card">
      <span aria-hidden="true">
        <Icon weight="duotone" />
      </span>
      <div>
        <p>{title}</p>
        {job ? (
          <>
            <strong>{JOB_STATUS_LABELS[job.status] ?? job.status}</strong>
            <small>
              {job.completed}개 완료 · {job.failed}개 실패 ·{" "}
              {formatDate(job.createdAt)}
            </small>
            {job.observed !== undefined ? (
              <div className="dashboard-job-facts">
                <span>확인 {job.observed}</span>
                <span>신규 {job.completed}</span>
                <span>중복 {job.duplicates ?? 0}</span>
                <span>최상위 {job.topLevelCount ?? 0}</span>
                <span>답글 {job.replyCount ?? 0}</span>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <strong>아직 작업 없음</strong>
            <small>실제 작업을 시작하면 상태가 표시됩니다.</small>
          </>
        )}
      </div>
    </article>
  );
}

export function DashboardView({ data }: { data: DashboardData }) {
  if (data.state === "disconnected") {
    return <DashboardEmptyState />;
  }

  if (data.state === "connected_empty") {
    return <DashboardEmptyState connectedChannel={data.channel.title} />;
  }

  const analyzedTotal =
    data.distribution.safe +
    data.distribution.caution +
    data.distribution.risk;
  const distribution = [
    {
      key: "safe",
      label: "안전",
      count: data.distribution.safe,
      icon: CheckCircle,
    },
    {
      key: "caution",
      label: "주의",
      count: data.distribution.caution,
      icon: WarningCircle,
    },
    {
      key: "risk",
      label: "위험",
      count: data.distribution.risk,
      icon: ShieldWarning,
    },
  ] as const;
  const publicSource = data.sourceKind === "public_url";

  return (
    <div className="dashboard-ready">
      <section className="dashboard-metrics" aria-label="실제 댓글 지표">
        {[
          {
            label: "가져온 댓글",
            value: data.metrics.imported,
            icon: ChatCircleDots,
            tone: "blue",
          },
          {
            label: "분석 완료",
            value: data.metrics.analyzed,
            icon: ShieldCheck,
            tone: "safe",
          },
          {
            label: "주의",
            value: data.metrics.caution,
            icon: WarningCircle,
            tone: "caution",
          },
          {
            label: "위험",
            value: data.metrics.risk,
            icon: ShieldWarning,
            tone: "risk",
          },
        ].map(({ icon: Icon, label, tone, value }) => (
          <article className={`dashboard-metric-card tone-${tone}`} key={label}>
            <div>
              <p>{label}</p>
              <span aria-hidden="true">
                <Icon weight="fill" />
              </span>
            </div>
            <strong>{value}</strong>
            <small>저장된 현재 데이터</small>
          </article>
        ))}
      </section>

      <section className="dashboard-primary-grid">
        <article className="dashboard-channel-card">
          <header>
            <div>
              <p>
                {publicSource ? "PUBLIC VIDEO SOURCE" : "CONNECTED CHANNEL"}
              </p>
              <h2>
                {publicSource
                  ? (data.video?.title ?? "공개 영상")
                  : (data.channel?.title ?? "연결된 채널")}
              </h2>
              <span>
                {publicSource
                  ? "OAuth 없이 공개 댓글만 분석"
                  : (data.channel?.handle ?? "채널 핸들 정보 없음")}
              </span>
            </div>
            {publicSource ? (
              <div className="source-badges">
                <span>공개 URL</span>
                <span>읽기 전용</span>
              </div>
            ) : (
              <span className="channel-health">
                <CheckCircle aria-hidden="true" weight="fill" />
                연결됨
              </span>
            )}
          </header>
          <div className="dashboard-video">
            <span aria-hidden="true">
              <FilmStrip weight="duotone" />
            </span>
            <div>
              <p>최근 선택 영상</p>
              <strong>{data.video?.title ?? "선택된 영상 없음"}</strong>
              <small>
                {data.video?.publishedAt
                  ? formatDate(data.video.publishedAt)
                  : "영상 목록에서 댓글을 가져올 영상을 선택하세요."}
              </small>
            </div>
            <Link
              href={
                publicSource ? "/app/connect/youtube" : "/app/videos"
              }
            >
              {publicSource ? "새 공개 영상" : "영상 관리"}
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </article>

        <article className="dashboard-insight-card">
          <span aria-hidden="true">
            <Sparkle weight="fill" />
          </span>
          <p>AI INSIGHT</p>
          <h2>댓글 흐름 요약</h2>
          <blockquote>
            {data.aiSummary ??
              "최종 분석이 10개 이상 쌓이면 실제 정제 신호를 바탕으로 요약이 표시됩니다."}
          </blockquote>
          <small>원문이 아닌 집계와 순화된 피드백만 사용합니다.</small>
        </article>
      </section>

      <section className="dashboard-job-grid" aria-label="최근 작업 상태">
        <JobCard icon={ChatCircleDots} job={data.latestImport} title="댓글 가져오기" />
        <JobCard icon={ChartBar} job={data.latestAnalysis} title="AI 분석" />
        {data.latestCost ? (
          <article className="dashboard-job-card dashboard-cost-card">
            <span aria-hidden="true">
              <Sparkle weight="duotone" />
            </span>
            <div>
              <p>분석 비용 snapshot</p>
              <strong>
                {data.latestCost.actualCalculatedCost === null
                  ? `${data.latestCost.estimatedCostLow.toFixed(6)}–${data.latestCost.estimatedCostHigh.toFixed(6)} ${data.latestCost.currency}`
                  : `$${data.latestCost.actualCalculatedCost.toFixed(6)}`}
              </strong>
              <small>
                {data.latestCost.stageOneModel} ·{" "}
                {data.latestCost.stageTwoModel}
              </small>
            </div>
          </article>
        ) : null}
      </section>

      <section className="dashboard-detail-grid">
        <article className="dashboard-distribution-card">
          <header>
            <div>
              <p>REVIEW DISTRIBUTION</p>
              <h2>안전 · 주의 · 위험</h2>
            </div>
            <strong>{analyzedTotal}개 분석</strong>
          </header>
          <div className="distribution-bars">
            {distribution.map(({ count, icon: Icon, key, label }) => (
              <div key={key}>
                <span>
                  <Icon aria-hidden="true" weight="fill" />
                  {label}
                </span>
                <i>
                  <b
                    className={`distribution-${key}`}
                    style={{
                      width: `${
                        analyzedTotal === 0
                          ? 0
                          : Math.max((count / analyzedTotal) * 100, count ? 4 : 0)
                      }%`,
                    }}
                  />
                </i>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="dashboard-priority-card">
          <header>
            <div>
              <p>PRIORITY COMMENTS</p>
              <h2>먼저 확인할 댓글</h2>
            </div>
            <Link href="/app/inbox">
              Inbox 열기
              <ArrowRight aria-hidden="true" />
            </Link>
          </header>
          {data.priorityComments.length > 0 ? (
            <ul>
              {data.priorityComments.map((comment) => (
                <li key={comment.rawCommentId}>
                  <span className={`review-level-${comment.reviewLevel}`}>
                    {comment.reviewLevel === "risk" ? "위험" : "주의"}
                  </span>
                  <div>
                    <strong>
                      {CATEGORY_LABELS[comment.category] ?? comment.category}
                    </strong>
                    <p>
                      {comment.sanitizedText ??
                        "보존할 만한 순화 피드백이 없습니다."}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dashboard-list-empty">
              현재 우선 검토할 주의·위험 댓글이 없습니다.
            </p>
          )}
        </article>
      </section>

      <section className="dashboard-activity-grid">
        <article>
          <h2>최근 판단 수정</h2>
          {data.recentCorrections.length > 0 ? (
            <ul>
              {data.recentCorrections.map((feedback) => (
                <li key={feedback.id}>
                  <strong>
                    {feedback.correctedReviewLevel
                      ? `등급 ${feedback.correctedReviewLevel}`
                      : feedback.decision}
                  </strong>
                  <span>
                    {feedback.editedSanitizedFeedback ?? "순화 문구 수정 없음"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>아직 저장한 판단 수정이 없습니다.</p>
          )}
        </article>
        <article>
          <h2>최근 YouTube 조치</h2>
          {data.recentActions.length > 0 ? (
            <ul>
              {data.recentActions.map((action) => (
                <li key={action.id}>
                  <strong>
                    {ACTION_LABELS[action.action] ?? action.action}
                  </strong>
                  <span>
                    {ACTION_STATE_LABELS[action.state] ?? action.state}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>아직 사용자가 확인해 실행한 조치가 없습니다.</p>
          )}
        </article>
      </section>
    </div>
  );
}
