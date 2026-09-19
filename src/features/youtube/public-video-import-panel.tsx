"use client";

import {
  ArrowRight,
  CheckCircle,
  ClockCounterClockwise,
  LinkSimple,
  ChatCircleDots,
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
import { ALL_PUBLIC_COMMENTS, PUBLIC_COMMENT_COUNTS } from "@/features/youtube/public-video-url";
import type {
  PublicVideoPreviewActionState,
  PublicVideoStartActionState,
} from "@/app/(product)/app/connect/youtube/public-video-actions";

import styles from "./public-video-import-panel.module.css";

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
  pending,
}: {
  error: string | null;
  progress: ImportJobProgress | null;
  pending: boolean;
}) {
  const importComplete = Boolean(progress && TERMINAL_STATES.has(progress.import.status));
  const finished = importComplete && (!progress?.analysis || TERMINAL_STATES.has(progress.analysis.status));
  const hasFailures = Boolean(error || progress?.import.errorCode ||
    progress?.import.status === "failed" || progress?.import.status === "partially_succeeded" ||
    progress?.import.failedCount || progress?.analysis?.failedCount ||
    progress?.analysis?.status === "failed" || progress?.analysis?.status === "partially_succeeded");
  const status = error ? "확인 필요" : finished ? hasFailures ? "일부 처리 실패" : "완료"
    : progress || pending ? "진행 중" : "대기 중";
  const importLabel = !progress ? pending ? "가져오는 중" : "수집 전"
    : progress.import.status === "failed" ? "수집 실패"
    : importComplete ? `확인 ${progress.import.observedCount}` : "가져오는 중";
  const analysisLabel = progress?.analysis
    ? `${progress.analysis.completedCount} / ${progress.analysis.totalCount}`
    : finished ? "분석 대상 없음" : "대기 중";

  return (
    <section aria-label="공개 댓글 가져오기 진행 상태" aria-live="polite" className={styles.progress}>
      <div className={styles.collection}>
        <header className={styles.sectionHeading}>
          <h2>댓글 수집 현황</h2>
          <span className={`${styles.status} ${hasFailures ? styles.errorStatus : finished ? styles.completeStatus : ""}`}>
            {hasFailures ? <WarningCircle aria-hidden="true" /> : finished ? <CheckCircle aria-hidden="true" /> : <ClockCounterClockwise aria-hidden="true" />}
            {status}
          </span>
        </header>
        {progress?.providerMode === "fixture" ? <span className={styles.fixture}>TEST FIXTURE</span> : null}
        <div className={styles.statusRow}>
          <span><ChatCircleDots aria-hidden="true" />댓글 가져오기</span>
          <strong>{importLabel}</strong>
        </div>
        <div className={styles.statusRow}>
          <span><CheckCircle aria-hidden="true" />AI 분석</span>
          <strong>{analysisLabel}</strong>
        </div>
        {progress?.analysis && !finished ? (
          <progress aria-label="AI 분석 진행률" max={Math.max(1, progress.analysis.totalCount)} value={progress.analysis.completedCount} />
        ) : null}
        {error ? <p role="alert" className={styles.error}>{error}</p> : hasFailures ? (
          <p role="alert" className={styles.error}>수집 실패 {progress?.import.failedCount ?? 0}개 · 분석 실패 {progress?.analysis?.failedCount ?? 0}개. 처리되지 않은 댓글이 있습니다.</p>
        ) : null}
        {!progress && !pending && !error ? <p className={styles.hint}>영상을 확인하고 댓글 수집을 시작해 주세요.</p> : null}
      </div>

      <div className={styles.results}>
        <header className={styles.sectionHeading}>
          <h2>댓글 수집 결과</h2>
          {progress && (progress.import.storedCount > 0 || progress.import.duplicateCount > 0) ? (
            <Link className={styles.inboxLink} href="/app/inbox">Comment Inbox에서 보기<ArrowRight aria-hidden="true" /></Link>
          ) : null}
        </header>
        <div className={styles.total}>
          <strong>{progress ? progress.import.storedCount.toLocaleString("ko-KR") : "—"}<small>{progress ? "개" : ""}</small></strong>
          <span>새로 저장한 댓글</span>
        </div>
        <div className={styles.counts}>
          {progress ? <><span>최상위 {progress.import.topLevelCount}</span><span>답글 {progress.import.replyCount}</span><span>중복 {progress.import.duplicateCount}</span></> : <span>수집이 시작되면 결과가 표시됩니다.</span>}
        </div>
        <dl aria-label="분류 결과 집계" className={styles.verdicts}>
          <div><dt>안전</dt><dd>{progress?.analysis?.verdictCounts.safe ?? "—"}</dd></div>
          <div><dt>주의</dt><dd>{progress?.analysis?.verdictCounts.caution ?? "—"}</dd></div>
          <div><dt>위험</dt><dd>{progress?.analysis?.verdictCounts.risk ?? "—"}</dd></div>
          <div><dt>판단 보류</dt><dd>{progress?.analysis?.verdictCounts.reviewQueue ?? "—"}</dd></div>
        </dl>
      </div>
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
  const [resumeVersion, setResumeVersion] = useState(0);
  const [retryPending, setRetryPending] = useState(false);
  const [log, setLog] = useState<{ counts: Record<string, number>; events: { id: string; at: string; stage: string; message: string }[] } | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const jobId =
    startState.status === "created" ? startState.jobId : initialJobId;
  const preview = previewState.status === "success" ? previewState.preview : null;
  const estimatedCommentCount = requestedCount === ALL_PUBLIC_COMMENTS
    ? preview?.commentCount ?? null
    : requestedCount;
  const cost = useMemo(
    () => estimatedCommentCount === null ? null : estimateAnalysisCost({ commentCount: estimatedCommentCount }),
    [estimatedCommentCount],
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
        setRuntimeError(null);
        let next = await fetchProgress(jobId);
        if (!cancelled) setProgress(next);
        // Always finish durable analysis handoff, even if collection committed just before a crash.
        do {
        if (cancelled) return;
        const importResponse = await fetch(
          `/api/import-jobs/${jobId}/process`,
          { method: "POST" },
        );
        if (!importResponse.ok) {
          const payload = (await importResponse.json()) as { error?: string };
          throw new Error(payload.error ?? "import_processing_failed");
        }

        next = await fetchProgress(jobId);
        if (!cancelled) setProgress(next);
        if (!TERMINAL_STATES.has(next.import.status)) await wait(1500);
        } while (!cancelled && !TERMINAL_STATES.has(next.import.status));

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
            await wait(1500);
          }
        }
        const logResponse = await fetch(`/api/import-jobs/${jobId}/logs`, { cache: "no-store" });
        if (logResponse.ok && !cancelled) setLog(await logResponse.json());
      } catch {
        if (!cancelled) {
          setRuntimeError(
            "작업이 중단됐습니다. 저장된 댓글과 분석 결과는 유지됩니다. 이어서 진행을 눌러 다시 시작하세요.",
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
  }, [jobId, pollingEnabled, resumeVersion]);

  const retryFailed = async () => {
    if (!progress?.analysis || retryPending) return;
    setRetryPending(true);
    try {
      const response = await fetch(`/api/analysis-jobs/${progress.analysis.jobId}/retry`, { method: "POST" });
      if (!response.ok) throw new Error("retry_failed");
      setResumeVersion(value => value + 1);
    } catch { setRuntimeError("재시도를 시작하지 못했습니다. 다시 시도해 주세요."); }
    finally { setRetryPending(false); }
  };

  if (!mode.enabled) return null;

  if (!mode.configured) {
    return <section className={styles.panel}>
      <h1>서버 API Key 설정이 필요합니다</h1>
      <p className={styles.hint}>공개 영상 댓글을 가져오려면 서버의 YOUTUBE_PUBLIC_API_KEY를 설정해 주세요.</p>
    </section>;
  }

  // A newly created job must not display the previous video's results.
  const currentProgress = progress?.jobId === jobId ? progress : null;
  const processing = Boolean(jobId && !runtimeError && (!currentProgress ||
    !TERMINAL_STATES.has(currentProgress.import.status) ||
    (currentProgress.analysis && !TERMINAL_STATES.has(currentProgress.analysis.status))));

  return (
    <section className={styles.panel} aria-labelledby="public-import-title">
      <header className={styles.heading}>
        <span className={styles.titleIcon}><LinkSimple aria-hidden="true" weight="bold" /></span>
        <div><h1 id="public-import-title">공개 영상 댓글 가져오기</h1>
          <p>YouTube URL로 댓글을 수집하고, 분석 결과를 Inbox에서 확인하세요.</p></div>
        <span className={styles.readOnly}>읽기 전용</span>
      </header>

      <form action={previewFormAction} className={styles.urlForm}>
        <label className={styles.urlField}>
          <span>공개 YouTube 영상 URL</span>
          <span className={styles.inputWrap}><LinkSimple aria-hidden="true" />
            <input defaultValue={preview?.canonicalUrl ?? ""} name="url" placeholder="https://www.youtube.com/watch?v=..." required type="url" disabled={processing || startPending} />
          </span>
        </label>
        <label>
          <span>댓글 수</span>
          <select aria-describedby="public-count-help" onChange={(event) => setRequestedCount(Number(event.target.value))} value={requestedCount} disabled={processing || startPending}>
            {PUBLIC_COMMENT_COUNTS.map((count) => <option key={count} value={count}>{count === ALL_PUBLIC_COMMENTS ? "전체 댓글" : `${count.toLocaleString("ko-KR")}개`}</option>)}
          </select>
        </label>
        <button className={styles.secondaryButton} disabled={previewPending || processing || startPending} type="submit">{previewPending ? "확인 중…" : "영상 확인"}</button>
      </form>
      <p className={styles.hint} id="public-count-help">{requestedCount === ALL_PUBLIC_COMMENTS
        ? "이 영상에서 조회 가능한 공개 댓글과 답글을 모두 가져옵니다. 댓글이 많을수록 수집·분석 시간과 비용이 늘어납니다."
        : "최상위 댓글과 답글을 합친 수입니다. 공개 댓글을 읽고 분석합니다."}</p>
      {previewState.status === "error" ? <p className={styles.error} role="alert">{previewState.message}</p> : null}

      {preview ? <div className={styles.confirmation}>
        <article className={styles.videoPreview}>
          <div className={styles.thumbnail}>
            {preview.thumbnailUrl ? <Image alt="" fill sizes="96px" src={preview.thumbnailUrl} /> : <YoutubeLogo aria-hidden="true" />}
          </div>
          <div className={styles.videoCopy}>
            <h2>{preview.title}</h2><p>{preview.channelTitle}</p>
            <div className={styles.videoMeta}>
              <span>공개 URL</span><span>{preview.commentCount === null ? "공개 댓글 수 확인 불가" : `공개 댓글 ${preview.commentCount.toLocaleString("ko-KR")}개`}</span>
              {!preview.commentsAvailable ? <span className={styles.error}>댓글 사용 불가</span> : null}
              {preview.fixtureLabel ? <strong className={styles.fixture}>{preview.fixtureLabel}</strong> : null}
            </div>
          </div>
        </article>
        <form action={startFormAction} className={styles.startForm}>
          <input name="url" type="hidden" value={preview.canonicalUrl} />
          <input name="requestedTotalCount" type="hidden" value={requestedCount} />
          <button className={styles.primaryButton} disabled={!preview.commentsAvailable || startPending || previewPending || processing} type="submit">
            {startPending ? "작업 만드는 중…" : processing ? "수집·분석 중…" : "댓글 가져오기 및 분석 시작"}<ArrowRight aria-hidden="true" />
          </button>
          <details className={styles.estimate}>
            <summary>{preview.fixtureLabel ? "Fixture 분석 비용" : "예상 OpenAI 비용"}</summary>
            <p>{preview.fixtureLabel ? "$0.0000 · 외부 API 호출 없음" : cost ? `${formatUsd(cost.estimatedCostLow)}–${formatUsd(cost.estimatedCostHigh)} · 실제 청구액과 다를 수 있습니다.` : "영상의 전체 댓글 수를 확인할 수 없어 비용을 미리 계산할 수 없습니다."}</p>
            <p>YouTube quota · {preview.fixtureLabel ? "0 unit" : "영상 확인 1 unit + 댓글·답글 페이지당 약 1 unit"}</p>
          </details>
        </form>
      </div> : null}
      {startState.status === "error" ? <p className={styles.error} role="alert">{startState.message}</p> : null}
      <ProgressPanel error={runtimeError} progress={currentProgress} pending={processing || startPending} />
      {jobId ? <div className={styles.startForm}>
        {runtimeError ? <button className={styles.primaryButton} onClick={() => setResumeVersion(value => value + 1)}>이어서 진행</button> : null}
        {(currentProgress?.analysis?.failedCount ?? 0) > 0 && !processing ? <button className={styles.primaryButton} disabled={retryPending} onClick={retryFailed}>{retryPending ? "준비 중…" : `실패한 ${currentProgress?.analysis?.failedCount}개만 재시도`}</button> : null}
        <a className={styles.inboxLink} href={`/api/import-jobs/${jobId}/logs`} download={`comment-job-${jobId}.json`}>작업 로그 저장</a>
      </div> : null}
      {currentProgress?.analysis ? <p className={styles.hint}>분석 완료 {currentProgress.analysis.completedCount}개 · 실패 {currentProgress.analysis.failedCount}개 · 대기·처리 중 {Math.max(0, currentProgress.analysis.totalCount - currentProgress.analysis.completedCount - currentProgress.analysis.failedCount)}개. 페이지를 다시 열면 저장된 지점부터 이어집니다.</p> : null}
      {log?.events.length ? <details className={styles.estimate}><summary>최근 작업 로그</summary><ul>{log.events.map(event => <li key={event.id}>{new Date(event.at).toLocaleString("ko-KR")} · {event.stage} · {event.message}</li>)}</ul></details> : null}
    </section>
  );
}
