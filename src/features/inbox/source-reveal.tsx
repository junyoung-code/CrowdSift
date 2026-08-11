"use client";

import { CaretUp, Eye, WarningCircle, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import type { CommentSource } from "./source-service";
import { CommentSourceBlock } from "./comment-source-block";

type SourceRevealProps = {
  commentId: string;
  label?: string;
};

export function SourceReveal({
  commentId,
  label = "원문 확인",
}: SourceRevealProps) {
  const [warningOpen, setWarningOpen] = useState(false);
  // Kept with the id it was fetched for: a revealed source must never survive a switch
  // to another comment, or the reader would judge one comment by another's words.
  const [revealed, setRevealed] = useState<{
    commentId: string;
    source: CommentSource;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const revealButtonRef = useRef<HTMLButtonElement>(null);
  const warningDialogRef = useRef<HTMLElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusAfterCloseRef = useRef(false);

  const closeWarning = () => {
    restoreFocusAfterCloseRef.current = true;
    setWarningOpen(false);
  };

  useEffect(() => {
    if (warningOpen) {
      if (confirmButtonRef.current) {
        confirmButtonRef.current.focus();
      } else {
        warningDialogRef.current?.focus();
      }

      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;

        event.preventDefault();
        closeWarning();
      };

      document.addEventListener("keydown", closeOnEscape);
      return () => document.removeEventListener("keydown", closeOnEscape);
    }

    if (restoreFocusAfterCloseRef.current) {
      restoreFocusAfterCloseRef.current = false;
      revealButtonRef.current?.focus();
    }
  }, [warningOpen]);

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

      setRevealed({
        commentId,
        source: (await response.json()) as CommentSource,
      });
      setWarningOpen(false);
    } catch {
      setError("원문을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  const source =
    revealed && revealed.commentId === commentId ? revealed.source : null;

  if (source) {
    return (
      <div className="source-reveal-content">
        <CommentSourceBlock
          authorAvatarUrl={source.authorAvatarUrl}
          authorDisplayName={source.authorDisplayName}
          capturedAt={source.capturedAt}
          protectedSource
          publishedAt={source.publishedAt}
          textDisplay={source.textDisplay}
        />
        <button
          className="button button-secondary source-collapse-button"
          onClick={() => {
            setRevealed(null);
            setError(null);
          }}
          type="button"
        >
          <CaretUp aria-hidden="true" weight="bold" />
          원문 접기
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        className="button button-secondary source-reveal-button"
        ref={revealButtonRef}
        type="button"
        onClick={() => setWarningOpen(true)}
      >
        <Eye aria-hidden="true" weight="bold" />
        {label}
      </button>

      {warningOpen ? (
        <div className="source-warning-backdrop" role="presentation">
          <section
            aria-labelledby={`source-warning-title-${commentId}`}
            aria-modal="true"
            className="source-warning-dialog"
            ref={warningDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <button
              aria-label="원문 경고 닫기"
              className="source-warning-close"
              onClick={closeWarning}
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
                onClick={closeWarning}
                type="button"
              >
                취소
              </button>
              <button
                className="button button-primary"
                disabled={loading}
                onClick={revealSource}
                ref={confirmButtonRef}
                type="button"
              >
                {loading
                  ? "불러오는 중…"
                  : error
                    ? "다시 시도"
                    : "경고를 확인하고 원문 보기"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
