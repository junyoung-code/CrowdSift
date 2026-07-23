"use client";

import { Eye, WarningCircle, X } from "@phosphor-icons/react";
import { useState } from "react";

type SourcePayload = {
  textDisplay: string;
  textOriginal: string | null;
  capturedAt: string;
};

export function SourceReveal({ commentId }: { commentId: string }) {
  const [warningOpen, setWarningOpen] = useState(false);
  const [source, setSource] = useState<SourcePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const revealSource = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/comments/${encodeURIComponent(commentId)}/source`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acknowledged: true }),
        },
      );

      if (!response.ok) {
        throw new Error("source_request_failed");
      }

      setSource((await response.json()) as SourcePayload);
      setWarningOpen(false);
    } catch {
      setError("원문을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  if (source) {
    return (
      <section className="source-reveal-content" aria-label="확인한 댓글 원문">
        <div>
          <WarningCircle aria-hidden="true" weight="fill" />
          <strong>확인한 원문</strong>
        </div>
        <p>{source.textOriginal ?? source.textDisplay}</p>
        <small>
          수집 시각:{" "}
          {new Intl.DateTimeFormat("ko-KR", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(source.capturedAt))}
        </small>
      </section>
    );
  }

  return (
    <>
      <button
        className="button button-secondary source-reveal-button"
        type="button"
        onClick={() => setWarningOpen(true)}
      >
        <Eye aria-hidden="true" weight="bold" />
        원문 확인
      </button>

      {warningOpen ? (
        <div className="source-warning-backdrop" role="presentation">
          <section
            aria-labelledby={`source-warning-title-${commentId}`}
            aria-modal="true"
            className="source-warning-dialog"
            role="dialog"
          >
            <button
              aria-label="원문 경고 닫기"
              className="source-warning-close"
              onClick={() => setWarningOpen(false)}
              type="button"
            >
              <X aria-hidden="true" />
            </button>
            <span aria-hidden="true">
              <WarningCircle weight="fill" />
            </span>
            <h3 id={`source-warning-title-${commentId}`}>
              유해한 표현이 포함될 수 있습니다
            </h3>
            <p>
              AI가 먼저 순화한 내용을 확인했습니다. 원문에는 욕설, 비하 또는
              불쾌한 표현이 있을 수 있습니다.
            </p>
            {error ? <p role="alert">{error}</p> : null}
            <div className="source-warning-actions">
              <button
                className="button button-secondary"
                onClick={() => setWarningOpen(false)}
                type="button"
              >
                취소
              </button>
              <button
                className="button button-primary"
                disabled={loading}
                onClick={revealSource}
                type="button"
              >
                {loading ? "불러오는 중…" : "경고를 확인하고 원문 보기"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
