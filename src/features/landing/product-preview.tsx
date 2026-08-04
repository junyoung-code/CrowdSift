"use client";

import {
  BellSimple,
  ChartBar,
  ChatCircleDots,
  CheckCircle,
  SlidersHorizontal,
  Sparkle,
  VideoCamera,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  motion,
  useInView,
  usePageInView,
  useScroll,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState } from "react";

import {
  heroPreviewStates,
  previewMetrics,
  previewReviewLevels,
} from "./landing-copy";
import { landingMotion } from "./landing-motion";

const metricIcons = [ChatCircleDots, CheckCircle, WarningCircle, BellSimple];

function usePrefersReducedMotion() {
  const [shouldReduceMotion, setShouldReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setShouldReduceMotion(query.matches);

    updatePreference();
    query.addEventListener("change", updatePreference);
    return () => query.removeEventListener("change", updatePreference);
  }, []);

  return shouldReduceMotion;
}

export function ProductPreview() {
  const previewRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isManual, setIsManual] = useState(false);
  const isInView = useInView(previewRef, { amount: 0.25 });
  const isPageInView = usePageInView();
  const shouldReduceMotion = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll({
    target: previewRef,
    offset: ["start start", "end start"],
  });
  const y = useTransform(
    scrollYProgress,
    [0, 1],
    [0, landingMotion.distance.parallax],
  );
  const rotate = useTransform(
    scrollYProgress,
    [0, 1],
    [0, landingMotion.tilt],
  );
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.985]);
  const activeState = heroPreviewStates[activeIndex];

  useEffect(() => {
    if (shouldReduceMotion || !isInView || !isPageInView || isManual) return;

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % heroPreviewStates.length);
    }, 4500);

    return () => window.clearInterval(interval);
  }, [isInView, isManual, isPageInView, shouldReduceMotion]);

  useEffect(() => {
    if (!isInView) {
      setActiveIndex(0);
      setIsManual(false);
    }
  }, [isInView]);

  return (
    <motion.section
      className="product-preview"
      aria-label="제품 예시 화면"
      ref={previewRef}
      style={shouldReduceMotion ? undefined : { y, rotate, scale }}
    >
      <p className="preview-label">
        <Sparkle aria-hidden="true" weight="fill" />
        제품 예시 화면
      </p>

      <div className="preview-browser">
        <div className="preview-browser-bar">
          <div className="browser-lights" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="browser-address" aria-hidden="true" />
          <SlidersHorizontal aria-hidden="true" weight="bold" />
        </div>

        <div className="preview-shell">
          <div className="preview-state-tabs" role="tablist" aria-label="제품 예시 단계">
            {heroPreviewStates.map((state, index) => (
              <button
                aria-selected={activeIndex === index}
                className={`preview-state-tab preview-state-${state.tone}`}
                key={state.id}
                onClick={() => {
                  setActiveIndex(index);
                  setIsManual(true);
                }}
                role="tab"
                type="button"
              >
                {state.tabLabel}
              </button>
            ))}
          </div>

          <div className="preview-title-row">
            <div aria-live="polite">
              <span className="preview-kicker">{activeState.kicker}</span>
              <strong>{activeState.title}</strong>
            </div>
            <span className="preview-video">
              <VideoCamera aria-hidden="true" weight="fill" />
              최근 영상
            </span>
          </div>

          <div className="preview-main">
            <div className="preview-metrics">
              {previewMetrics.map(({ label, value, tone }, index) => {
                const Icon = metricIcons[index];

                return (
                  <article className={`metric-card metric-${tone}`} key={label}>
                    <span>
                      {label}
                      <Icon aria-hidden="true" weight="bold" />
                    </span>
                    <strong>{value}</strong>
                  </article>
                );
              })}
            </div>

            <div className="preview-levels">
              <div className="preview-panel-heading">
                <span>검토 우선순위</span>
                <ChartBar aria-hidden="true" weight="bold" />
              </div>
              <ul>
                {previewReviewLevels.map(
                  ({ label, count, description, tone }) => (
                    <li className={`level-row level-${tone}`} key={label}>
                      <span className="level-icon" aria-hidden="true">
                        {tone === "safe" ? "✓" : "!"}
                      </span>
                      <span>
                        <strong>{label}</strong>
                        <small>{description}</small>
                      </span>
                      <b>{count}</b>
                    </li>
                  ),
                )}
              </ul>
            </div>
          </div>

          <aside className="preview-insight">
            <span className="insight-icon" aria-hidden="true">
              <Sparkle weight="fill" />
            </span>
            <div>
              <strong>AI 요약</strong>
              <p>{activeState.summary}</p>
            </div>
            <span className={`insight-badge insight-badge-${activeState.tone}`}>
              {activeState.status}
            </span>
          </aside>
        </div>
      </div>
    </motion.section>
  );
}
