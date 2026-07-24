export const DEFAULT_PRICING = {
  version: "openai-2026-07-24",
  effectiveAt: "2026-07-24T00:00:00.000Z",
  currency: "USD",
  stageOne: { inputPerMillion: 0.2, outputPerMillion: 1.25 },
  stageTwo: { inputPerMillion: 0.75, outputPerMillion: 4.5 },
  embedding: { inputPerMillion: 0.02 },
} as const;

export const FIXTURE_PRICING = {
  version: "fixture-0-cost-v1",
  effectiveAt: "2026-07-24T00:00:00.000Z",
  currency: "USD",
  stageOne: { inputPerMillion: 0, outputPerMillion: 0 },
  stageTwo: { inputPerMillion: 0, outputPerMillion: 0 },
  embedding: { inputPerMillion: 0 },
} as const;

const DEFAULT_ESTIMATE_ASSUMPTIONS = {
  stageOneInputPerComment: { low: 220, high: 500 },
  stageOneOutputPerComment: { low: 50, high: 120 },
  stageTwoShare: { low: 0.15, high: 0.5 },
  stageTwoInputPerComment: { low: 420, high: 900 },
  stageTwoOutputPerComment: { low: 90, high: 220 },
  embeddingInputPerComment: { low: 40, high: 160 },
} as const;

export type AnalysisPricing = {
  version: string;
  effectiveAt: string;
  currency: string;
  stageOne: { inputPerMillion: number; outputPerMillion: number };
  stageTwo: { inputPerMillion: number; outputPerMillion: number };
  embedding: { inputPerMillion: number };
};

const tokenCost = (tokens: number, pricePerMillion: number) =>
  (tokens / 1_000_000) * pricePerMillion;

const roundUsd = (value: number) => Number(value.toFixed(8));

export const estimateAnalysisCost = ({
  commentCount,
  pricing = DEFAULT_PRICING,
}: {
  commentCount: number;
  pricing?: AnalysisPricing;
}) => {
  const boundedCount = Math.max(Math.trunc(commentCount), 0);
  const stageTwoLow = Math.ceil(
    boundedCount * DEFAULT_ESTIMATE_ASSUMPTIONS.stageTwoShare.low,
  );
  const stageTwoHigh = Math.ceil(
    boundedCount * DEFAULT_ESTIMATE_ASSUMPTIONS.stageTwoShare.high,
  );
  const inputLow =
    boundedCount *
      DEFAULT_ESTIMATE_ASSUMPTIONS.stageOneInputPerComment.low +
    stageTwoLow *
      (DEFAULT_ESTIMATE_ASSUMPTIONS.stageTwoInputPerComment.low +
        DEFAULT_ESTIMATE_ASSUMPTIONS.embeddingInputPerComment.low);
  const inputHigh =
    boundedCount *
      DEFAULT_ESTIMATE_ASSUMPTIONS.stageOneInputPerComment.high +
    stageTwoHigh *
      (DEFAULT_ESTIMATE_ASSUMPTIONS.stageTwoInputPerComment.high +
        DEFAULT_ESTIMATE_ASSUMPTIONS.embeddingInputPerComment.high);
  const outputLow =
    boundedCount *
      DEFAULT_ESTIMATE_ASSUMPTIONS.stageOneOutputPerComment.low +
    stageTwoLow *
      DEFAULT_ESTIMATE_ASSUMPTIONS.stageTwoOutputPerComment.low;
  const outputHigh =
    boundedCount *
      DEFAULT_ESTIMATE_ASSUMPTIONS.stageOneOutputPerComment.high +
    stageTwoHigh *
      DEFAULT_ESTIMATE_ASSUMPTIONS.stageTwoOutputPerComment.high;
  const lowCost =
    tokenCost(
      boundedCount *
        DEFAULT_ESTIMATE_ASSUMPTIONS.stageOneInputPerComment.low,
      pricing.stageOne.inputPerMillion,
    ) +
    tokenCost(
      boundedCount *
        DEFAULT_ESTIMATE_ASSUMPTIONS.stageOneOutputPerComment.low,
      pricing.stageOne.outputPerMillion,
    ) +
    tokenCost(
      stageTwoLow *
        DEFAULT_ESTIMATE_ASSUMPTIONS.stageTwoInputPerComment.low,
      pricing.stageTwo.inputPerMillion,
    ) +
    tokenCost(
      stageTwoLow *
        DEFAULT_ESTIMATE_ASSUMPTIONS.stageTwoOutputPerComment.low,
      pricing.stageTwo.outputPerMillion,
    ) +
    tokenCost(
      stageTwoLow *
        DEFAULT_ESTIMATE_ASSUMPTIONS.embeddingInputPerComment.low,
      pricing.embedding.inputPerMillion,
    );
  const highCost =
    tokenCost(
      boundedCount *
        DEFAULT_ESTIMATE_ASSUMPTIONS.stageOneInputPerComment.high,
      pricing.stageOne.inputPerMillion,
    ) +
    tokenCost(
      boundedCount *
        DEFAULT_ESTIMATE_ASSUMPTIONS.stageOneOutputPerComment.high,
      pricing.stageOne.outputPerMillion,
    ) +
    tokenCost(
      stageTwoHigh *
        DEFAULT_ESTIMATE_ASSUMPTIONS.stageTwoInputPerComment.high,
      pricing.stageTwo.inputPerMillion,
    ) +
    tokenCost(
      stageTwoHigh *
        DEFAULT_ESTIMATE_ASSUMPTIONS.stageTwoOutputPerComment.high,
      pricing.stageTwo.outputPerMillion,
    ) +
    tokenCost(
      stageTwoHigh *
        DEFAULT_ESTIMATE_ASSUMPTIONS.embeddingInputPerComment.high,
      pricing.embedding.inputPerMillion,
    );

  return {
    pricingVersion: pricing.version,
    pricingEffectiveAt: pricing.effectiveAt,
    currency: pricing.currency,
    estimatedInputTokensLow: inputLow,
    estimatedInputTokensHigh: inputHigh,
    estimatedOutputTokensLow: outputLow,
    estimatedOutputTokensHigh: outputHigh,
    estimatedCostLow: roundUsd(lowCost),
    estimatedCostHigh: roundUsd(highCost),
    disclaimer:
      "예상 비용은 입력 길이와 2차 분석 비율에 따른 범위이며 실제 청구액을 보장하지 않습니다.",
  };
};

export const calculateObservedCost = ({
  embeddingInputTokens,
  pricing = DEFAULT_PRICING,
  stageOne,
  stageTwo,
}: {
  stageOne: { inputTokens: number; outputTokens: number };
  stageTwo: { inputTokens: number; outputTokens: number };
  embeddingInputTokens: number;
  pricing?: AnalysisPricing;
}) => ({
  pricingVersion: pricing.version,
  currency: pricing.currency,
  stageOneInputTokens: stageOne.inputTokens,
  stageOneOutputTokens: stageOne.outputTokens,
  stageTwoInputTokens: stageTwo.inputTokens,
  stageTwoOutputTokens: stageTwo.outputTokens,
  embeddingInputTokens,
  calculatedCost: roundUsd(
    tokenCost(stageOne.inputTokens, pricing.stageOne.inputPerMillion) +
      tokenCost(
        stageOne.outputTokens,
        pricing.stageOne.outputPerMillion,
      ) +
      tokenCost(stageTwo.inputTokens, pricing.stageTwo.inputPerMillion) +
      tokenCost(
        stageTwo.outputTokens,
        pricing.stageTwo.outputPerMillion,
      ) +
      tokenCost(
        embeddingInputTokens,
        pricing.embedding.inputPerMillion,
      ),
  ),
});

export const summarizeStoredModelUsage = (
  runs: Array<{
    stage: number;
    usage: unknown;
  }>,
) => {
  const totals = {
    stageOne: { inputTokens: 0, outputTokens: 0 },
    stageTwo: { inputTokens: 0, outputTokens: 0 },
    embeddingInputTokens: 0,
  };

  for (const run of runs) {
    if (
      typeof run.usage !== "object" ||
      run.usage === null ||
      Array.isArray(run.usage)
    ) {
      continue;
    }
    const usage = run.usage as Record<string, unknown>;
    const inputTokens =
      typeof usage.inputTokens === "number" ? usage.inputTokens : 0;
    const outputTokens =
      typeof usage.outputTokens === "number" ? usage.outputTokens : 0;
    const embeddingInputTokens =
      typeof usage.embeddingInputTokens === "number"
        ? usage.embeddingInputTokens
        : 0;

    if (run.stage === 1) {
      totals.stageOne.inputTokens += inputTokens;
      totals.stageOne.outputTokens += outputTokens;
    } else if (run.stage === 2) {
      totals.stageTwo.inputTokens += inputTokens;
      totals.stageTwo.outputTokens += outputTokens;
      totals.embeddingInputTokens += embeddingInputTokens;
    }
  }

  return totals;
};
