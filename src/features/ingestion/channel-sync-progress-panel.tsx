"use client";

import { useEffect, useState } from "react";

import type { ChannelSyncProgress } from "./channel-sync-progress";

const STATUS_ENDPOINT = "/api/channel-comment-sync/status";
const PROCESS_ENDPOINT = "/api/channel-comment-sync/process";
const POLL_INTERVAL_MS = 2_000;

type FormAction = (formData: FormData) => void | Promise<void>;

export function ChannelSyncSetup({
  configureAction,
  maxDate,
}: {
  maxDate: string;
  configureAction: FormAction;
}) {
  return (
    <div className="channel-sync-setup">
      <div>
        <p>채널 댓글 자동 수집</p>
        <h3>언제부터 댓글을 가져올지 선택하세요</h3>
        <span>
          최신 댓글부터 선택한 날짜까지 역순으로 가져옵니다. 브라우저를 닫아도
          자동 수집은 계속됩니다.
        </span>
      </div>
      <form action={configureAction} className="channel-sync-setup-row">
        <label htmlFor="channel-sync-start-date">
          언제의 댓글부터 가져올까요?
          <input
            id="channel-sync-start-date"
            max={maxDate}
            name="startDate"
            required
            type="date"
          />
        </label>
        <button className="button button-primary" type="submit">
          댓글 가져오기 시작
        </button>
      </form>
    </div>
  );
}

const formatLastSuccess = (value: string | null) => {
  if (!value) return "최근 성공 기록 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const readProgress = async (signal: AbortSignal) => {
  const response = await fetch(STATUS_ENDPOINT, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error("channel_sync_status_failed");
  return (await response.json()) as ChannelSyncProgress;
};

export function ChannelSyncProgressPanel({
  initialProgress,
  requestNowAction,
  setEnabledAction,
}: {
  initialProgress: ChannelSyncProgress;
  requestNowAction: FormAction;
  setEnabledAction: FormAction;
}) {
  const [progress, setProgress] = useState(initialProgress);
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialProgress.active) return;

    const controller = new AbortController();
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const before = await readProgress(controller.signal);
        if (cancelled) return;
        setProgress(before);
        if (!before.active) return;

        const processResponse = await fetch(PROCESS_ENDPOINT, {
          method: "POST",
          signal: controller.signal,
        });
        if (!processResponse.ok) {
          throw new Error("channel_sync_process_failed");
        }

        const after = await readProgress(controller.signal);
        if (cancelled) return;
        setProgress(after);
        if (after.active) {
          pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setClientError(
          error instanceof Error && error.message === "channel_sync_status_failed"
            ? "동기화 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
            : "댓글 동기화를 진행하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
    };

    void poll();

    return () => {
      cancelled = true;
      controller.abort();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [initialProgress.active]);

  const alertMessage = clientError ?? progress.errorMessage;

  return (
    <div className="channel-sync-progress-panel">
      <div className="channel-sync-progress-heading">
        <div>
          <p>채널 댓글 자동 수집</p>
          <h3>{progress.backfillLabel}</h3>
        </div>
        <span className="channel-sync-state">
          {progress.enabled ? "자동 동기화 켜짐" : "일시중지"}
        </span>
      </div>

      {progress.active ? (
        <div
          aria-label="댓글 동기화 진행 중"
          aria-valuetext="전체 댓글 수를 알 수 없어 완료율 없이 진행 중"
          className="channel-sync-indeterminate"
          role="progressbar"
        >
          <span />
        </div>
      ) : null}

      <p className="channel-sync-live-status" aria-live="polite">
        {progress.statusMessage}
      </p>
      {alertMessage ? (
        <p className="form-message form-message-error" role="alert">
          {alertMessage}
        </p>
      ) : null}

      <dl className="channel-sync-details">
        <div>
          <dt>시작 날짜</dt>
          <dd>{progress.startDate}</dd>
        </div>
        <div>
          <dt>초기 수집 상태</dt>
          <dd>{progress.backfillLabel}</dd>
        </div>
        <div>
          <dt>마지막 성공</dt>
          <dd>{formatLastSuccess(progress.lastSuccessfulSyncAt)}</dd>
        </div>
      </dl>

      {progress.latestRunLabel ? (
        <p className="channel-sync-run-label">
          아래 숫자는 마지막으로 {progress.latestRunLabel} 결과입니다
        </p>
      ) : null}

      <dl className="channel-sync-metrics">
        <div>
          <dt>신규 저장</dt>
          <dd>{progress.counts.stored}</dd>
        </div>
        <div>
          <dt>상태 갱신</dt>
          <dd>{progress.counts.updated}</dd>
        </div>
        <div>
          <dt>중복 건너뜀</dt>
          <dd>{progress.counts.duplicate}</dd>
        </div>
        <div>
          <dt>실패</dt>
          <dd>{progress.counts.failed}</dd>
        </div>
        <div>
          <dt>분류 예약</dt>
          <dd>{progress.counts.analyzed}</dd>
        </div>
      </dl>

      <div className="channel-sync-actions">
        <form action={requestNowAction}>
          <button className="button button-secondary" type="submit">
            지금 동기화
          </button>
        </form>
        <form action={setEnabledAction}>
          <input
            name="enabled"
            type="hidden"
            value={progress.enabled ? "false" : "true"}
          />
          <button className="button button-secondary" type="submit">
            {progress.enabled
              ? "자동 동기화 일시중지"
              : "자동 동기화 다시 시작"}
          </button>
        </form>
      </div>
    </div>
  );
}
