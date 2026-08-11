"use client";

import {
  ArrowRight,
  Brain,
  Eye,
  EyeSlash,
  ShieldCheck,
  Sparkle,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import Link from "next/link";
import { useReducer } from "react";

import { landingAnalysisExamples } from "./landing-copy";
import { landingMotion } from "./landing-motion";

export type InteractiveDemoState = {
  selectedId: string;
  revealedSource: boolean;
  stage: number;
};

type DemoAction =
  | { type: "select"; id: string }
  | { type: "toggle-source" }
  | { type: "advance" }
  | { type: "reset" };

const initialState: InteractiveDemoState = {
  selectedId: landingAnalysisExamples[0].id,
  revealedSource: false,
  stage: 0,
};

export function demoReducer(
  state: InteractiveDemoState,
  action: DemoAction,
): InteractiveDemoState {
  switch (action.type) {
    case "select":
      return { selectedId: action.id, revealedSource: false, stage: 0 };
    case "toggle-source":
      return { ...state, revealedSource: !state.revealedSource };
    case "advance":
      return { ...state, stage: Math.min(4, state.stage + 1) };
    case "reset":
      return { ...state, revealedSource: false, stage: 0 };
  }
}

export function InteractiveAnalysisDemo() {
  const [state, dispatch] = useReducer(demoReducer, initialState);
  const selected =
    landingAnalysisExamples.find(({ id }) => id === state.selectedId) ??
    landingAnalysisExamples[0];
  const results = [
    {
      label: "1차 분류",
      value: `${selected.stageOne.level} · ${selected.stageOne.reason}`,
    },
    { label: "크리에이터 문맥", value: selected.creatorContext },
    {
      label: "정제된 피드백",
      value: selected.sanitizedFeedback ?? "정제할 피드백 없음",
    },
    {
      label: "최종 추천",
      value: `${selected.finalRecommendation} · ${selected.proposedAction}`,
    },
  ];

  return (
    <div
      className="interactive-analysis-demo"
      aria-label="제품 예시 화면 - AI 분석 데모"
      role="region"
    >
      <div className="analysis-demo-heading">
        <span>
          <Sparkle aria-hidden="true" weight="fill" />
          제품 예시 화면
        </span>
        <span>{state.stage} / 4 단계</span>
      </div>

      <div className="analysis-example-tabs" aria-label="분석할 댓글 예시" role="group">
        {landingAnalysisExamples.map(({ id, label }) => (
          <button
            aria-label={`${label} 예시 선택`}
            aria-pressed={state.selectedId === id}
            key={id}
            onClick={() => dispatch({ type: "select", id })}
            type="button"
          >
            <span aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="analysis-demo-body"
        initial={{ opacity: 0, y: landingMotion.distance.small }}
        key={selected.id}
        transition={{
          duration: landingMotion.duration.fast,
          ease: landingMotion.ease,
        }}
      >
          <section className="protected-source-panel" aria-labelledby="demo-source-title">
            <div>
              <span className="analysis-demo-icon" aria-hidden="true">
                {selected.isHarmful ? <EyeSlash weight="duotone" /> : <Eye weight="duotone" />}
              </span>
              <div>
                <small>보존된 댓글 원문</small>
                <h3 id="demo-source-title">{selected.label}</h3>
              </div>
            </div>

            {selected.isHarmful && !state.revealedSource ? (
              <p className="source-protected-copy">
                유해 표현이 포함된 원문을 기본으로 가렸습니다.
              </p>
            ) : (
              <p className="source-raw-copy">{selected.rawSource}</p>
            )}

            <p className="source-summary">{selected.sourceSummary}</p>

            {selected.isHarmful ? (
              <button
                className="source-reveal-control"
                onClick={() => dispatch({ type: "toggle-source" })}
                type="button"
              >
                {state.revealedSource ? "원문 다시 가리기" : "가려진 원문 보기"}
              </button>
            ) : null}

            <div className="rule-signal-list" aria-label="규칙 신호">
              {selected.ruleSignals.map((signal) => (
                <span key={signal}>{signal}</span>
              ))}
            </div>
          </section>

          <section className="analysis-demo-results" aria-labelledby="demo-results-title">
            <div className="analysis-demo-results-heading">
              <span className="analysis-demo-icon" aria-hidden="true">
                <Brain weight="duotone" />
              </span>
              <div>
                <small>분리 저장되는 분석 결과</small>
                <h3 id="demo-results-title">근거를 단계별로 확인하세요</h3>
              </div>
            </div>

            <ol>
              {results.map(({ label, value }, index) => {
                const isReady = state.stage >= index + 1;
                return (
                  <li className={isReady ? "is-ready" : ""} key={label}>
                    <span>{index + 1}</span>
                    <div>
                      <small>{label}</small>
                      <p>{isReady ? value : "다음 단계에서 표시됩니다"}</p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {state.stage < 4 ? (
              <button
                className="analysis-demo-next"
                onClick={() => dispatch({ type: "advance" })}
                type="button"
              >
                다음 분석 단계
                <ArrowRight aria-hidden="true" weight="bold" />
              </button>
            ) : (
              <div className="analysis-demo-confirmation">
                <ShieldCheck aria-hidden="true" weight="duotone" />
                <div>
                  <strong>사용자가 확인해야 조치됩니다</strong>
                  <p>이 예시는 추천만 보여주며 실제 댓글에 어떤 조치도 하지 않습니다.</p>
                </div>
                <Link href="/auth/sign-in">로그인하고 직접 검토하기</Link>
              </div>
            )}
          </section>
      </motion.div>
    </div>
  );
}
