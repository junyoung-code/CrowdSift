"use client";

import { useEffect, useId, useRef, useState } from "react";

type MermaidCanvasProps = {
  source: string;
};

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MermaidCanvas({ source }: MermaidCanvasProps) {
  const outputRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const feedbackTimerRef = useRef<number | undefined>(undefined);
  const reactId = useId().replace(/:/g, "");
  const renderSequenceRef = useRef(0);
  const [isRendering, setIsRendering] = useState(true);
  const [renderError, setRenderError] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let cancelled = false;
    const sequence = ++renderSequenceRef.current;

    async function renderDiagram() {
      setIsRendering(true);
      setRenderError("");

      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          flowchart: {
            htmlLabels: false,
            nodeSpacing: 34,
            rankSpacing: 58,
          },
        });

        const result = await mermaid.render(
          `commenthawk-map-${reactId}-${sequence}`,
          source,
        );

        if (!cancelled && outputRef.current) {
          outputRef.current.innerHTML = result.svg;
          result.bindFunctions?.(outputRef.current);
        }
      } catch {
        if (!cancelled) {
          setRenderError("차트를 다시 그리지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [reactId, source]);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current !== undefined) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    },
    [],
  );

  function showFeedback(message: string) {
    setFeedback(message);
    if (feedbackTimerRef.current !== undefined) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(""), 1800);
  }

  async function copySource() {
    try {
      await navigator.clipboard.writeText(source);
      showFeedback("복사됨");
    } catch {
      showFeedback("복사하지 못했습니다");
    }
  }

  async function openFullScreen() {
    try {
      if (!shellRef.current?.requestFullscreen) {
        showFeedback("전체 화면을 지원하지 않는 브라우저입니다");
        return;
      }
      await shellRef.current.requestFullscreen();
    } catch {
      showFeedback("전체 화면을 열지 못했습니다");
    }
  }

  return (
    <div
      ref={shellRef}
      data-testid="mermaid-shell"
      className="relative overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50 shadow-[0_24px_70px_rgba(15,23,42,0.08)] fullscreen:rounded-none fullscreen:border-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-5">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-blue-700">FLOWCHART TD</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">CommentHawk 구현 전체 지도</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openFullScreen}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <ExpandIcon />
            전체 화면
          </button>
          <button
            type="button"
            onClick={copySource}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <CopyIcon />
            Mermaid 복사
          </button>
        </div>
      </div>

      <div className="relative max-h-[72vh] min-h-[36rem] overflow-auto bg-[radial-gradient(circle_at_top,#ffffff_0%,#f8fafc_64%)] p-8 sm:p-12 fullscreen:max-h-[calc(100vh-70px)] fullscreen:min-h-[calc(100vh-70px)]">
        <div
          ref={outputRef}
          data-testid="mermaid-output"
          className="mx-auto min-w-[1120px] [&_svg]:h-auto [&_svg]:max-w-none"
          aria-label="Frontend, Backend, AI, Security 네 파트로 구성된 CommentHawk 개발 지도"
        />

        {isRendering && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-white/55 text-sm font-medium text-slate-500 backdrop-blur-[1px]">
            차트를 그리고 있습니다…
          </div>
        )}
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {feedback}
      </div>
      {feedback && (
        <div className="absolute right-4 top-[4.5rem] rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-lg">
          {feedback}
        </div>
      )}
      {renderError && (
        <p role="alert" className="border-t border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {renderError}
        </p>
      )}
    </div>
  );
}
