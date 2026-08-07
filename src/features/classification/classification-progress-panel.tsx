"use client";

import { ArrowRight, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { ImportJobProgress } from "@/features/ingestion/import-job-progress";

const TERMINAL_STATES = new Set([
  "succeeded",
  "partially_succeeded",
  "failed",
]);

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

export function ClassificationProgressPanel({
  importJobId,
  initialProgress = null,
}: {
  importJobId: string;
  initialProgress?: ImportJobProgress | null;
}) {
  const [progress, setProgress] = useState(initialProgress);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialProgress) return;
    let active = true;
    void fetchProgress(importJobId)
      .then((next) => {
        if (active) setProgress(next);
      })
      .catch(() => {
        if (active) setError("분류 작업 상태를 불러오지 못했습니다.");
      });
    return () => {
      active = false;
    };
  }, [importJobId, initialProgress]);

  const processUntilTerminal = async () => {
    const analysisJobId = progress?.analysis?.jobId;
    if (!analysisJobId) return;

    setRunning(true);
    setError(null);
    try {
      let next = progress;
      do {
        const response = await fetch(
          `/api/analysis-jobs/${analysisJobId}/process?maxItems=5`,
          { method: "POST" },
        );
        if (!response.ok) throw new Error("classification_processing_failed");
        next = await fetchProgress(importJobId);
        setProgress(next);
      } while (
        next.analysis &&
        !TERMINAL_STATES.has(next.analysis.status)
      );
    } catch {
      setError("분류를 완료하지 못했습니다. 저장된 진행 상태부터 다시 시도합니다.");
    } finally {
      setRunning(false);
    }
  };

  const retryFailed = async () => {
    const analysisJobId = progress?.analysis?.jobId;
    if (!analysisJobId) return;
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(`/api/analysis-jobs/${analysisJobId}/retry`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("classification_retry_failed");
      const next = await fetchProgress(importJobId);
      setProgress(next);
      setRunning(false);
      await processUntilTerminal();
    } catch {
      setError("실패 항목을 다시 준비하지 못했습니다.");
      setRunning(false);
    }
  };

  const analysis = progress?.analysis;
  const complete = analysis ? TERMINAL_STATES.has(analysis.status) : false;
  const counts = analysis?.verdictCounts ?? {
    safe: 0,
    caution: 0,
    risk: 0,
    reviewQueue: 0,
  };
  const handled = analysis
    ? analysis.completedCount + analysis.failedCount
    : 0;

  return (
    <section
      aria-label="안전·주의·위험 분류"
      aria-live="polite"
      className="classification-progress-panel"
    >
      <header>
        <span aria-hidden="true">
          <ShieldCheck weight="duotone" />
        </span>
        <div>
          <p>CLASSIFICATION V1</p>
          <h3>{complete ? "분류 완료" : "안전·주의·위험 분류"}</h3>
          <small>Moderation + Luna, 필요한 댓글만 Terra 검증</small>
        </div>
      </header>

      {error ? (
        <p className="form-message form-message-error" role="alert">
          <WarningCircle aria-hidden="true" weight="fill" />
          {error}
        </p>
      ) : null}

      {analysis ? (
        <>
          <div className="classification-progress-summary">
            <strong>
              {handled} / {analysis.totalCount}
            </strong>
            <progress
              aria-label="댓글 분류 진행률"
              max={Math.max(analysis.totalCount, 1)}
              value={handled}
            />
          </div>
          <div className="classification-verdict-counts">
            <span>안전 {counts.safe}</span>
            <span>주의 {counts.caution}</span>
            <span>위험 {counts.risk}</span>
            <span>판단 보류 {counts.reviewQueue}</span>
          </div>

          {!complete ? (
            <button
              className="button button-primary"
              disabled={running}
              onClick={() => void processUntilTerminal()}
              type="button"
            >
              {running ? "분류 중…" : "안전·주의·위험 분류 시작"}
              <ArrowRight aria-hidden="true" weight="bold" />
            </button>
          ) : null}

          {complete && analysis.failedCount > 0 ? (
            <button
              className="button button-secondary"
              disabled={running}
              onClick={() => void retryFailed()}
              type="button"
            >
              실패 항목 재시도
            </button>
          ) : null}

          {complete ? (
            <Link className="button button-primary" href="/app/inbox">
              Comment Inbox에서 보기
            </Link>
          ) : null}
        </>
      ) : (
        <p>분류 작업을 준비하고 있습니다.</p>
      )}
    </section>
  );
}
