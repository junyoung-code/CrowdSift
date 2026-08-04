"use client";

import { CheckCircle, Database, ListChecks, UserFocus } from "@phosphor-icons/react";
import { useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useRef, useState } from "react";

import { landingCopy } from "./landing-copy";
import { getAnalysisStepFromProgress } from "./landing-motion";

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
  const [activeStep, setActiveStep] = useState(0);
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: storyRef,
    offset: ["start 70%", "end 35%"],
  });

  useMotionValueEvent(scrollYProgress, "change", (progress) => {
    if (!shouldReduceMotion) {
      setActiveStep(getAnalysisStepFromProgress(progress));
    }
  });

  return (
    <div
      className="analysis-scroll-story"
      aria-label="두 단계 분석 과정"
      ref={storyRef}
      role="region"
    >
      <ol className="analysis-story-steps">
        {landingCopy.processSteps.map(({ step, title, description }, index) => (
          <li aria-current={activeStep === index ? "step" : undefined} key={title}>
            <span className="process-step">{step}</span>
            <div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="analysis-story-visual">
        <div className="analysis-story-panel">
          <div className="analysis-story-panel-heading">
            <div>
              <span>LIVE PROCESS</span>
              <strong>{landingCopy.processSteps[activeStep].title}</strong>
            </div>
            <span>{activeStep + 1} / 4</span>
          </div>

          <progress
            aria-label="분석 진행 단계"
            max={4}
            value={activeStep + 1}
          />

          <ul>
            {visualRows.map(({ label, value, Icon }, index) => (
              <li className={index <= activeStep ? "is-ready" : ""} key={label}>
                <span className="analysis-story-row-icon" aria-hidden="true">
                  <Icon weight="duotone" />
                </span>
                <span>
                  <small>{label}</small>
                  <strong>{index <= activeStep ? value : "다음 단계에서 확인"}</strong>
                </span>
                <CheckCircle aria-hidden="true" weight="fill" />
              </li>
            ))}
          </ul>

          <p className="analysis-story-note">
            단계는 스크롤 방향에 따라 되돌아가며, 원문과 분석 기록은 서로
            덮어쓰지 않습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
