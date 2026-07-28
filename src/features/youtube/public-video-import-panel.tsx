"use client";

import {
  ArrowRight,
  CheckCircle,
  ClockCounterClockwise,
  CurrencyDollar,
  LinkSimple,
  ShieldCheck,
  WarningCircle,
  YoutubeLogo,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";

import { estimateAnalysisCost } from "@/features/analysis/cost-estimator";
import type { ImportJobProgress } from "@/features/ingestion/import-job-progress";
import { PUBLIC_COMMENT_COUNTS } from "@/features/youtube/public-video-url";
import type {
  PublicVideoPreviewActionState,
  PublicVideoStartActionState,
} from "@/app/(product)/app/connect/youtube/public-video-actions";

const INITIAL_PREVIEW_STATE: PublicVideoPreviewActionState = {
  status: "idle",
};
const INITIAL_START_STATE: PublicVideoStartActionState = {
  status: "idle",
};
const TERMINAL_STATES = new Set([
  "succeeded",
  "partially_succeeded",
  "failed",
]);

type PublicVideoImportPanelProps = {
  mode: { enabled: boolean; configured: boolean };
  previewAction: (
    state: PublicVideoPreviewActionState,
    formData: FormData,
  ) => Promise<PublicVideoPreviewActionState>;
  startAction: (
    state: PublicVideoStartActionState,
    formData: FormData,
  ) => Promise<PublicVideoStartActionState>;
  initialPreviewState?: PublicVideoPreviewActionState;
  initialStartState?: PublicVideoStartActionState;
  initialJobId?: string | null;
  initialProgress?: ImportJobProgress | null;
  pollingEnabled?: boolean;
};

const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(value);

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const fetchProgress = async (jobId: string): Promise<ImportJobProgress> => {
  const response = await fetch(`/api/import-jobs/${jobId}/status`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    data?: ImportJobProgress;
    error?: string;
  };

  if (!response.ok || !payload.data) {
    throw new Error(payload.error ?? "job_progress_unavailable");
  }

  return payload.data;
};

function ProgressPanel({
  error,
  progress,
}: {
  error: string | null;
  progress: ImportJobProgress | null;
}) {
  if (!progress && !error) {
    return null;
  }

  const importComplete = progress
    ? TERMINAL_STATES.has(progress.import.status)
    : false;
  const analysisComplete =
    importComplete &&
    (!progress?.analysis || TERMINAL_STATES.has(progress.analysis.status));

  return (
    <section
      aria-label="공개 댓글 가져오기 진행 상태"
      aria-live="polite"
      className="public-import-progress"
    >
      <header>
        <div>
          <p>LIVE PROGRESS</p>
          <h3>
            {error
              ? "처리를 완료하지 못했습니다"
              : analysisComplete
                ? "댓글 분석 완료"
                : importComplete
                  ? "AI 분석 중"
                  : "공개 댓글을 가져오는 중"}
          </h3>
          {progress?.providerMode === "fixture" ? (
            <strong className="public-fixture-label">TEST FIXTURE</strong>
          ) : null}
        </div>
        <span className={error ? "is-error" : "is-running"}>
          {error ? (
            <WarningCircle weight="fill" />
          ) : analysisComplete ? (
            <CheckCircle weight="fill" />
          ) : (
            <ClockCounterClockwise weight="duotone" />
          )}
          {error ? "확인 필요" : analysisComplete ? "완료" : "진행 중"}
        </span>
      </header>

      {error ? <p className="public-import-error">{error}</p> : null}

      {progress ? (
        <>
          <ol className="public-import-steps">
            <li className="is-complete">
              <CheckCircle weight="fill" />
              댓글 가져오기
            </li>
            <li className={importComplete ? "is-active" : ""}>
              <ShieldCheck weight="duotone" />
              규칙 검사 · 1차 AI · 필요 시 2차 AI
            </li>
            <li className={analysisComplete ? "is-complete" : ""}>
              <CheckCircle weight="fill" />
              완료
            </li>
          </ol>

          <div className="public-import-counts">
            <span>확인 {progress.import.observedCount}</span>
            <span>신규 {progress.import.storedCount}</span>
            <span>중복 {progress.import.duplicateCount}</span>
            <span>실패 {progress.import.failedCount}</span>
            <span>최상위 {progress.import.topLevelCount}</span>
            <span>답글 {progress.import.replyCount}</span>
          </div>

          <div className="public-analysis-progress">
            <div>
              <span>AI 분석</span>
              <strong>
                {progress.analysis
                  ? `${progress.analysis.completedCount} / ${progress.analysis.totalCount}`
                  : "작업 생성 대기"}
              </strong>
            </div>
            <progress
              aria-label="AI 분석 진행률"
              max={progress.analysis?.totalCount ?? 1}
              value={progress.analysis?.completedCount ?? 0}
            />
          </div>

          {analysisComplete ? (
            <Link className="button button-primary" href="/app/inbox">
              Comment Inbox에서 보기
              <ArrowRight aria-hidden="true" weight="bold" />
            </Link>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function PublicVideoImportPanel({
  initialJobId = null,
  initialPreviewState = INITIAL_PREVIEW_STATE,
  initialProgress = null,
  initialStartState = INITIAL_START_STATE,
  mode,
  pollingEnabled = true,
  previewAction,
  startAction,
}: PublicVideoImportPanelProps) {
  const [previewState, previewFormAction, previewPending] = useActionState(
    previewAction,
    initialPreviewState,
  );
  const [startState, startFormAction, startPending] = useActionState(
    startAction,
    initialStartState,
  );
  const [requestedCount, setRequestedCount] = useState(20);
  const [progress, setProgress] = useState<ImportJobProgress | null>(
    initialProgress,
  );
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const jobId =
    startState.status === "created" ? startState.jobId : initialJobId;
  const cost = useMemo(
    () => estimateAnalysisCost({ commentCount: requestedCount }),
    [requestedCount],
  );

  useEffect(() => {
    if (startState.status !== "created") {
      return;
    }

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("job", startState.jobId);
    window.history.replaceState(null, "", currentUrl);
  }, [startState]);

  useEffect(() => {
    if (!pollingEnabled || !jobId) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const importResponse = await fetch(
          `/api/import-jobs/${jobId}/process`,
          { method: "POST" },
        );
        if (!importResponse.ok) {
          const payload = (await importResponse.json()) as { error?: string };
          throw new Error(payload.error ?? "import_processing_failed");
        }

        let next = await fetchProgress(jobId);
        if (!cancelled) setProgress(next);

        while (
          !cancelled &&
          next.analysis &&
          !TERMINAL_STATES.has(next.analysis.status)
        ) {
          const analysisResponse = await fetch(
            `/api/analysis-jobs/${next.analysis.jobId}/process?maxItems=5`,
            { method: "POST" },
          );
          if (!analysisResponse.ok) {
            throw new Error("analysis_processing_failed");
          }
          next = await fetchProgress(jobId);
          if (!cancelled) setProgress(next);
          if (!TERMINAL_STATES.has(next.analysis?.status ?? "pending")) {
            await wait(250);
          }
        }
      } catch {
        if (!cancelled) {
          setRuntimeError(
            "처리 상태를 불러오지 못했습니다. 잠시 후 새로고침해 다시 확인해 주세요.",
          );
        }
      }
    };

    const timer = window.setTimeout(() => {
      void run();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [jobId, pollingEnabled]);

  if (!mode.enabled) {
    return null;
  }

  if (!mode.configured) {
    return (
      <section className="public-video-panel public-video-setup">
        <span aria-hidden="true">
          <YoutubeLogo weight="fill" />
        </span>
        <div>
          <p>PUBLIC URL · LOCAL DEVELOPMENT</p>
          <h2>서버 API Key 설정이 필요합니다</h2>
          <span>
            로컬 `.env.local`에 `YOUTUBE_PUBLIC_API_KEY`를 설정하면 OAuth 없이
            공개 영상 댓글을 읽기 전용으로 테스트할 수 있습니다.
          </span>
        </div>
      </section>
    );
  }

  const preview =
    previewState.status === "success" ? previewState.preview : null;

  return (
    <section className="public-video-panel">
      <header className="public-video-panel-heading">
        <span aria-hidden="true">
          <LinkSimple weight="duotone" />
        </span>
        <div>
          <p>PUBLIC URL · DEVELOPMENT</p>
          <h2>다른 크리에이터의 공개 영상으로 테스트</h2>
          <span>
            YouTube 계정 연결 없이 공개 댓글을 읽고 분류합니다. 댓글 숨김·삭제
            권한은 생기지 않습니다.
          </span>
        </div>
        <div className="source-badges" aria-label="출처 정책">
          <span>공개 URL</span>
          <span>읽기 전용</span>
        </div>
      </header>

      <form action={previewFormAction} className="public-video-url-form">
        <label>
          <span>공개 YouTube 영상 URL</span>
          <span>
            <LinkSimple aria-hidden="true" />
            <input
              defaultValue={preview?.canonicalUrl ?? ""}
              name="url"
              placeholder="https://www.youtube.com/watch?v=..."
              required
              type="url"
            />
          </span>
        </label>
        <label className="public-video-count-field">
          <span>댓글 수</span>
          <select
            aria-describedby="public-count-help"
            onChange={(event) =>
              setRequestedCount(Number(event.target.value))
            }
            value={requestedCount}
          >
            {PUBLIC_COMMENT_COUNTS.map((count) => (
              <option key={count} value={count}>
                {count.toLocaleString("ko-KR")}개
              </option>
            ))}
          </select>
        </label>
        <button
          className="button button-secondary"
          disabled={previewPending}
          type="submit"
        >
          {previewPending ? "확인 중…" : "영상 확인"}
        </button>
      </form>

      {previewState.status === "error" ? (
        <p className="form-message form-message-error" role="alert">
          <WarningCircle aria-hidden="true" weight="fill" />
          {previewState.message}
        </p>
      ) : null}

      {preview ? (
        <div className="public-video-confirmation">
          <article className="public-video-preview">
            <div className="public-video-thumbnail">
              {preview.thumbnailUrl ? (
                <Image
                  alt=""
                  fill
                  sizes="(max-width: 760px) 100vw, 320px"
                  src={preview.thumbnailUrl}
                />
              ) : (
                <YoutubeLogo aria-hidden="true" weight="fill" />
              )}
            </div>
            <div>
              <div className="public-video-preview-state">
                <span>
                  {preview.commentsAvailable
                    ? "댓글 사용 가능"
                    : "댓글 사용 불가"}
                </span>
                {preview.fixtureLabel ? (
                  <strong>{preview.fixtureLabel}</strong>
                ) : null}
              </div>
              <h3>{preview.title}</h3>
              <p>{preview.channelTitle}</p>
              <small>
                공개 댓글{" "}
                {preview.commentCount === null
                  ? "수 확인 불가"
                  : `${preview.commentCount.toLocaleString("ko-KR")}개`}
              </small>
            </div>
          </article>

          <form action={startFormAction} className="public-video-start-form">
            <input name="url" type="hidden" value={preview.canonicalUrl} />
            <input
              name="requestedTotalCount"
              type="hidden"
              value={requestedCount}
            />

            <div className="public-video-estimate">
              <div>
                <CurrencyDollar aria-hidden="true" weight="duotone" />
                <span>
                  <strong>
                    {preview.fixtureLabel
                      ? "Fixture 분석 비용"
                      : "예상 OpenAI 비용"}
                  </strong>
                  <small>
                    {preview.fixtureLabel
                      ? "$0.0000 · 외부 API 호출 없음"
                      : `${formatUsd(cost.estimatedCostLow)}–${formatUsd(
                          cost.estimatedCostHigh,
                        )}`}
                  </small>
                </span>
              </div>
              <div>
                <YoutubeLogo aria-hidden="true" weight="duotone" />
                <span>
                  <strong>YouTube quota</strong>
                  <small>
                    {preview.fixtureLabel
                      ? "0 unit · Fixture 데이터"
                      : "영상 확인 1 unit + 댓글·답글 페이지당 약 1 unit"}
                  </small>
                </span>
              </div>
            </div>

            <p className="public-video-consent" id="public-count-help">
              시작하면 선택한 총 댓글 수 안에서 최상위 댓글과 답글을 함께
              저장하고 AI 분석을 실행합니다.{" "}
              {preview.fixtureLabel
                ? "현재 Fixture 모드에서는 외부 API를 호출하거나 비용을 발생시키지 않습니다."
                : "예상 비용은 실제 청구액과 다를 수 있습니다."}
            </p>

            <button
              className="button button-primary"
              disabled={!preview.commentsAvailable || startPending}
              type="submit"
            >
              {startPending
                ? "작업 만드는 중…"
                : "댓글 가져오기 및 분석 시작"}
              <ArrowRight aria-hidden="true" weight="bold" />
            </button>
          </form>
        </div>
      ) : null}

      {startState.status === "error" ? (
        <p className="form-message form-message-error" role="alert">
          <WarningCircle aria-hidden="true" weight="fill" />
          {startState.message}
        </p>
      ) : null}

      <ProgressPanel error={runtimeError} progress={progress} />
    </section>
  );
}
