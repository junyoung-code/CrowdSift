import {
  BellSimple,
  ChartBar,
  ChatCircleDots,
  CheckCircle,
  SlidersHorizontal,
  Sparkle,
  VideoCamera,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { previewMetrics, previewReviewLevels } from "./landing-copy";

const metricIcons = [ChatCircleDots, CheckCircle, WarningCircle, BellSimple];

export function ProductPreview() {
  return (
    <section className="product-preview" aria-label="제품 예시 화면">
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
          <div className="preview-title-row">
            <div>
              <span className="preview-kicker">댓글 운영 현황</span>
              <strong>오늘의 댓글을 먼저 정리했어요</strong>
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
              <p>반복 질문과 배송 관련 개선 의견이 늘었습니다.</p>
            </div>
            <span className="insight-badge">검토 23건</span>
          </aside>
        </div>
      </div>
    </section>
  );
}
