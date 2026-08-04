import {
  ArrowRight,
  CaretDown,
  CheckCircle,
  Database,
  EyeSlash,
  Flag,
  ListChecks,
  Play,
  ShieldCheck,
  Sparkle,
  UserFocus,
  YoutubeLogo,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { AnalysisScrollStory } from "./analysis-scroll-story";
import { InteractiveAnalysisDemo } from "./interactive-analysis-demo";
import { landingCopy } from "./landing-copy";
import { LandingHeader } from "./landing-header";
import { ProductPreview } from "./product-preview";

const problemIcons = [EyeSlash, Flag, ListChecks];
const solutionIcons = [ListChecks, UserFocus, ShieldCheck];

export function LandingPage() {
  return (
    <main className="landing">
      <LandingHeader />

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span aria-hidden="true" />
            {landingCopy.hero.eyebrow}
          </p>
          <h1>
            댓글의 소음은 줄이고,
            <span>중요한 목소리는 더 선명하게.</span>
          </h1>
          <p className="hero-description">{landingCopy.hero.description}</p>

          <div className="hero-actions">
            <Link className="button button-primary" href="/auth/sign-in">
              YouTube 댓글 관리 시작하기
              <ArrowRight aria-hidden="true" weight="bold" />
            </Link>
            <a className="button button-secondary" href="#analysis">
              <Play aria-hidden="true" weight="fill" />
              분석 방식 보기
            </a>
          </div>

          <div className="hero-trust">
            <span>
              <CheckCircle aria-hidden="true" weight="fill" />
              원문 보존
            </span>
            <span>
              <CheckCircle aria-hidden="true" weight="fill" />
              사용자 확인형 조치
            </span>
          </div>
        </div>

        <ProductPreview />
      </section>

      <section className="landing-strip" aria-label="CrowdSift 핵심 원칙">
        <p>AI가 대신 결정하지 않습니다</p>
        <ul>
          <li>
            <ShieldCheck aria-hidden="true" weight="fill" />
            안전한 검토
          </li>
          <li>
            <Database aria-hidden="true" weight="fill" />
            원본과 분석 분리
          </li>
          <li>
            <UserFocus aria-hidden="true" weight="fill" />
            크리에이터별 기준
          </li>
        </ul>
      </section>

      <section
        className="landing-section problem-section"
        id="problems"
        aria-labelledby="problem-title"
      >
        <div className="section-heading section-heading-centered">
          <p className="eyebrow">THE PROBLEM</p>
          <h2 id="problem-title">
            댓글이 많아질수록 중요한 신호는 더 쉽게 묻힙니다
          </h2>
          <p>
            모든 댓글을 같은 방식으로 읽으면 사람도 지치고, 정작 중요한
            피드백도 놓치기 쉽습니다.
          </p>
        </div>

        <div className="card-grid card-grid-three problem-grid">
          {landingCopy.problems.map(
            ({ number, title, description }, index) => {
              const Icon = problemIcons[index];

              return (
                <article key={title}>
                  <div className="card-topline">
                    <span className="card-icon">
                      <Icon aria-hidden="true" weight="duotone" />
                    </span>
                    <span className="card-number">{number}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              );
            },
          )}
        </div>
      </section>

      <section
        className="landing-section solution-section"
        id="solutions"
        aria-labelledby="solution-title"
      >
        <div className="section-heading solution-heading">
          <div>
            <p className="eyebrow">THE SOLUTION</p>
            <h2 id="solution-title">삭제보다 먼저, 이해하고 분리합니다</h2>
          </div>
          <p>
            CrowdSift는 댓글을 없애는 도구가 아니라, 크리에이터가 더 나은
            판단을 할 수 있도록 검토 순서와 근거를 정리하는 도구입니다.
          </p>
        </div>

        <div className="card-grid card-grid-three solution-grid">
          {landingCopy.solutions.map(
            ({ eyebrow, title, description }, index) => {
              const Icon = solutionIcons[index];

              return (
                <article key={title}>
                  <span className="solution-icon">
                    <Icon aria-hidden="true" weight="duotone" />
                  </span>
                  <p className="card-eyebrow">{eyebrow}</p>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <span className="card-detail">
                    자세히 보기
                    <ArrowRight aria-hidden="true" weight="bold" />
                  </span>
                </article>
              );
            },
          )}
        </div>
      </section>

      <section
        className="landing-section process-section"
        id="analysis"
        aria-labelledby="two-stage-title"
      >
        <div className="section-heading section-heading-centered">
          <p className="eyebrow">TWO-STAGE ANALYSIS</p>
          <h2 id="two-stage-title">
            두 번 분석하고, 마지막 판단은 크리에이터가 합니다
          </h2>
          <p>
            모든 댓글을 무겁게 처리하지 않고, 문맥이 필요한 댓글에만
            크리에이터별 기준을 더합니다.
          </p>
        </div>

        <AnalysisScrollStory />
      </section>

      <section className="landing-ai-dark" aria-labelledby="ai-process-title">
        <div className="ai-copy">
          <p className="eyebrow">SOURCE-PRESERVING AI</p>
          <h2 id="ai-process-title">
            원문은 보존하고,
            <span>검토할 의미만 정리합니다</span>
          </h2>
          <p>
            원본 댓글, 규칙 신호, AI 결과, 정제 피드백, 사용자 수정,
            moderation 이력을 서로 다른 기록으로 남깁니다.
          </p>
          <a className="button button-light" href="#integration">
            연결 방식 보기
            <ArrowRight aria-hidden="true" weight="bold" />
          </a>
        </div>

        <InteractiveAnalysisDemo />

        <div className="ai-facts">
          <article>
            <ListChecks aria-hidden="true" weight="duotone" />
            <h3>안전 · 주의 · 위험</h3>
            <p>색뿐 아니라 이름과 이유로 검토 순위를 표시합니다.</p>
          </article>
          <article>
            <Sparkle aria-hidden="true" weight="duotone" />
            <h3>정책 · 허용어 · 과거 수정</h3>
            <p>동의한 피드백만 같은 크리에이터의 판단에 사용합니다.</p>
          </article>
          <article>
            <ShieldCheck aria-hidden="true" weight="duotone" />
            <h3>사용자 확인 후에만 실행</h3>
            <p>되돌리기 어려운 조치는 명시적인 확인을 먼저 받습니다.</p>
          </article>
        </div>
      </section>

      <section
        className="landing-section integration-section"
        id="integration"
        aria-labelledby="youtube-title"
      >
        <div className="youtube-mark" aria-hidden="true">
          <YoutubeLogo weight="fill" />
        </div>
        <div className="integration-copy">
          <p className="eyebrow">FIRST INTEGRATION</p>
          <h2 id="youtube-title">먼저 YouTube에서 시작합니다</h2>
          <p>
            크리에이터가 소유한 채널 하나를 연결하고, 영상 하나의 실제 댓글
            20–50개부터 안전하게 검증합니다. 답글은 해당 스레드와 함께
            보존합니다.
          </p>
          <div className="integration-actions">
            <span className="supported-platform">
              <CheckCircle aria-hidden="true" weight="fill" />
              YouTube 지원
            </span>
            <span className="integration-scope">
              읽기 연결과 moderation 권한을 분리
            </span>
          </div>
        </div>
      </section>

      <section className="final-cta" aria-labelledby="final-cta-title">
        <div className="final-cta-icon" aria-hidden="true">
          <ShieldCheck weight="duotone" />
        </div>
        <p className="eyebrow">START SMALL, LEARN SAFELY</p>
        <h2 id="final-cta-title">첫 20개 댓글부터 검토해 보세요</h2>
        <p>
          연결과 조치는 분리되어 있으며, 원문과 모든 판단 이력은 덮어쓰지
          않습니다.
        </p>
        <Link className="button button-primary" href="/auth/sign-in">
          CrowdSift 시작하기
          <ArrowRight aria-hidden="true" weight="bold" />
        </Link>
      </section>

      <footer className="landing-footer">
        <Link className="brand" href="/" aria-label="CrowdSift 홈">
          <span className="brand-mark" aria-hidden="true">
            <ShieldCheck weight="fill" />
          </span>
          <strong>CrowdSift</strong>
        </Link>
        <p>크리에이터를 위한 사람 중심의 AI 댓글 운영 도구</p>
        <a href="#top" aria-label="페이지 맨 위로">
          맨 위로
          <CaretDown className="footer-caret" aria-hidden="true" weight="bold" />
        </a>
      </footer>
    </main>
  );
}
