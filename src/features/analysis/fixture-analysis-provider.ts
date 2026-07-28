import "server-only";

import type { AnalysisProvider } from "./analysis-provider";
import type {
  DashboardSummaryOutput,
  ModelResult,
  Stage1Input,
  Stage1Output,
  Stage2Input,
  Stage2Output,
} from "./contracts";

const modelResult = <T>(
  output: T,
  providerResponseId: string,
): ModelResult<T> => ({
  output,
  provider: "fixture",
  modelIdentifier: "fixture-analysis-v1",
  providerResponseId,
  latencyMs: 0,
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  },
});

const classifyText = (sourceText: string) => {
  if (/비밀번호|당첨 확인/.test(sourceText)) {
    return {
      category: "phishing" as const,
      reviewLevel: "risk" as const,
      toxicity: 0.1,
      spam: 0.8,
      phishing: 0.99,
      actionableFeedback: false,
      recommendedAction: "reject" as const,
      explanation: "계정 정보 입력을 유도하는 테스트 피싱 댓글",
    };
  }
  if (/찾아가서|가족 계정/.test(sourceText)) {
    return {
      category: "threat_or_serious_risk" as const,
      reviewLevel: "risk" as const,
      toxicity: 0.99,
      spam: 0,
      phishing: 0,
      actionableFeedback: false,
      recommendedAction: "reject" as const,
      explanation: "표적 괴롭힘 또는 위협을 포함한 테스트 댓글",
    };
  }
  if (/source harmful text|볼 가치가/.test(sourceText)) {
    return {
      category: "abusive_no_signal" as const,
      reviewLevel: "risk" as const,
      toxicity: 0.94,
      spam: 0,
      phishing: 0,
      actionableFeedback: false,
      recommendedAction: "reject" as const,
      explanation: "유용한 신호가 없는 테스트 악성 댓글",
    };
  }
  if (/채널에 오시면|수익 보장|외부 메신저/.test(sourceText)) {
    return {
      category: "spam_advertisement" as const,
      reviewLevel: "caution" as const,
      toxicity: 0,
      spam: 0.97,
      phishing: 0.08,
      actionableFeedback: false,
      recommendedAction: "hold_for_review" as const,
      explanation: "홍보 목적의 테스트 댓글",
    };
  }
  if (/소리|자막|핵심|화면|시간 링크|비교 화면|광고 구간/.test(sourceText)) {
    const toxic = /왜 이렇게|제대로/.test(sourceText);
    return {
      category: toxic
        ? ("toxic_but_actionable" as const)
        : ("constructive_feedback" as const),
      reviewLevel: "caution" as const,
      toxicity: toxic ? 0.55 : 0.05,
      spam: 0,
      phishing: 0,
      actionableFeedback: true,
      recommendedAction: "review" as const,
      explanation: "구체적인 개선 신호가 있는 테스트 댓글",
    };
  }
  if (/[?？]$/.test(sourceText)) {
    return {
      category: "question" as const,
      reviewLevel: "safe" as const,
      toxicity: 0,
      spam: 0,
      phishing: 0,
      actionableFeedback: false,
      recommendedAction: "none" as const,
      explanation: "정보를 묻는 테스트 질문",
    };
  }

  return {
    category: "positive" as const,
    reviewLevel: "safe" as const,
    toxicity: 0,
    spam: 0,
    phishing: 0,
    actionableFeedback: false,
    recommendedAction: "none" as const,
    explanation: "긍정적이거나 중립적인 테스트 댓글",
  };
};

export class FixtureAnalysisProvider implements AnalysisProvider {
  readonly fixtureLabel = "TEST FIXTURE";

  async classifyStage1(input: Stage1Input) {
    const classification = classifyText(input.sourceText);
    const output: Stage1Output = {
      ...classification,
      confidence: 0.99,
      needsSecondPass: classification.reviewLevel !== "safe",
      secondPassReasons:
        classification.reviewLevel === "safe" ? [] : ["fixture-review"],
    };

    return modelResult(output, `fixture-stage1-${input.rawCommentId}`);
  }

  async classifyStage2(input: Stage2Input) {
    const classification = classifyText(input.sourceText);
    const output: Stage2Output = {
      ...classification,
      confidence: 0.99,
      sanitizedFeedback: classification.actionableFeedback
        ? "영상의 전달력을 높일 수 있도록 해당 요소를 개선해 주세요."
        : null,
      normalizedQuestion:
        classification.category === "question" ? input.sourceText : null,
      manualReview: classification.reviewLevel !== "safe",
      evidenceReview:
        classification.category === "threat_or_serious_risk",
    };

    return modelResult(output, `fixture-stage2-${input.rawCommentId}`);
  }

  async embed(text: string) {
    const seed = Array.from(text).reduce(
      (total, character) => total + (character.codePointAt(0) ?? 0),
      0,
    );
    return {
      vector: Array.from(
        { length: 1536 },
        (_, index) => ((seed + index * 17) % 1000) / 1000,
      ),
      model: "fixture-embedding-1536",
      usage: {
        inputTokens: 0,
        totalTokens: 0,
      },
    };
  }

  async summarizeDashboard(input: {
    analysisCount: number;
  }): Promise<ModelResult<DashboardSummaryOutput>> {
    return modelResult(
      {
        summary: `TEST FIXTURE · 저장된 댓글 ${input.analysisCount}개의 분석 요약입니다.`,
      },
      "fixture-dashboard-summary",
    );
  }
}
