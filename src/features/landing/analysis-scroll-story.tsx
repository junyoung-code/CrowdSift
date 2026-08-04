"use client";

import { CheckCircle, Database, ListChecks, UserFocus } from "@phosphor-icons/react";
import {
  motion,
  useInView,
  usePageInView,
  useReducedMotion,
} from "motion/react";
import { useEffect, useReducer, useRef, useState } from "react";

import { landingCopy } from "./landing-copy";

export const ANALYSIS_AUTOPLAY_MS = 4000;
export const ANALYSIS_MANUAL_PAUSE_MS = 8000;

export type AnalysisWalkthroughState = { activeStep: number };
export type AnalysisWalkthroughAction =
  | { type: "select"; index: number }
  | { type: "advance" }
  | { type: "reset" };

export function analysisWalkthroughReducer(
  state: AnalysisWalkthroughState,
  action: AnalysisWalkthroughAction,
) {
  if (action.type === "select") return { activeStep: action.index };
  if (action.type === "advance") {
    return {
      activeStep: (state.activeStep + 1) % landingCopy.processSteps.length,
    };
  }
  return { activeStep: 0 };
}

const visualRows = [
  {
    label: "댓글 원문",
    value: "원문과 스레드 구조 보존",
    Icon: Database,
  },
  {
    label: "공통 규칙",
    value: "주의 · 신뢰도 78%",
    Icon: ListChecks,
  },
  {
    label: "크리에이터 문맥",
    value: "정책과 과거 수정 3건",
    Icon: UserFocus,
  },
  {
    label: "추천",
    value: "숨김 검토 · 사용자 확인 필요",
    Icon: CheckCircle,
  },
] as const;

export function AnalysisScrollStory() {
  const storyRef = useRef<HTMLDivElement>(null);
  const manualPauseTimeoutRef = useRef<number | null>(null);
  const [state, dispatch] = useReducer(analysisWalkthroughReducer, {
    activeStep: 0,
  });
  const [isInteracting, setIsInteracting] = useState(false);
  const [isManualPaused, setIsManualPaused] = useState(false);
  const isInView = useInView(storyRef, { amount: 0.35 });
  const isPageInView = usePageInView();
  const shouldReduceMotion = useReducedMotion();
  const activeStep = landingCopy.processSteps[state.activeStep];

  const clearManualPause = () => {
    if (manualPauseTimeoutRef.current !== null) {
      window.clearTimeout(manualPauseTimeoutRef.current);
      manualPauseTimeoutRef.current = null;
    }
    setIsManualPaused(false);
  };

  const selectStep = (index: number) => {
    clearManualPause();
    dispatch({ type: "select", index });
    setIsManualPaused(true);
    manualPauseTimeoutRef.current = window.setTimeout(() => {
      manualPauseTimeoutRef.current = null;
      setIsManualPaused(false);
    }, ANALYSIS_MANUAL_PAUSE_MS);
  };

  useEffect(() => {
    if (
      shouldReduceMotion ||
      !isInView ||
      !isPageInView ||
      isInteracting ||
      isManualPaused
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      dispatch({ type: "advance" });
    }, ANALYSIS_AUTOPLAY_MS);

    return () => window.clearInterval(interval);
  }, [isInView, isInteracting, isManualPaused, isPageInView, shouldReduceMotion]);

  useEffect(() => {
    return () => {
      if (manualPauseTimeoutRef.current !== null) {
        window.clearTimeout(manualPauseTimeoutRef.current);
      }
    };
  }, []);

  return (
    <motion.div
      aria-label="두 단계 분석 과정"
      className="analysis-scroll-story"
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsInteracting(false);
        }
      }}
      onFocusCapture={() => setIsInteracting(true)}
      onMouseEnter={() => setIsInteracting(true)}
      onMouseLeave={() => setIsInteracting(false)}
      onViewportLeave={() => {
        clearManualPause();
        dispatch({ type: "reset" });
      }}
      ref={storyRef}
      role="region"
    >
      <ol className="analysis-story-steps">
        {landingCopy.processSteps.map(({ step, title, description }, index) => (
          <li key={title}>
            <button
              aria-current={state.activeStep === index ? "step" : undefined}
              onClick={() => selectStep(index)}
              type="button"
            >
              <span className="process-step">{step}</span>
              <span>
                <strong aria-level={3} role="heading">
                  {title}
                </strong>
                <small>{description}</small>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="analysis-story-visual">
        <div className="analysis-story-panel">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="analysis-story-panel-heading"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            key={activeStep.title}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div>
              <span>LIVE PROCESS</span>
              <strong>{activeStep.title}</strong>
            </div>
            <span>
              {state.activeStep + 1} / {landingCopy.processSteps.length}
            </span>
          </motion.div>

          <progress
            aria-label="분석 진행 단계"
            max={landingCopy.processSteps.length}
            value={state.activeStep + 1}
          />

          <ul>
            {visualRows.map(({ label, value, Icon }, index) => (
              <motion.li
                animate={{
                  opacity: index <= state.activeStep + 1 ? 1 : 0.52,
                  y: 0,
                }}
                className={index <= state.activeStep + 1 ? "is-ready" : ""}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                key={label}
                transition={{
                  delay: shouldReduceMotion ? 0 : index * 0.06,
                  duration: 0.2,
                  ease: "easeOut",
                }}
              >
                <span aria-hidden="true" className="analysis-story-row-icon">
                  <Icon weight="duotone" />
                </span>
                <span>
                  <small>{label}</small>
                  <strong>
                    {index <= state.activeStep + 1 ? value : "다음 단계에서 확인"}
                  </strong>
                </span>
                <CheckCircle aria-hidden="true" weight="fill" />
              </motion.li>
            ))}
          </ul>

          <p className="analysis-story-note">
            단계를 선택하거나 자동 재생으로 분석 흐름을 확인할 수 있습니다.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
