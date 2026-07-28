import { describe, expect, it, vi } from "vitest";

import type { Stage1Input } from "./contracts";
import {
  AnalysisSchemaError,
  createOpenAIAnalysisProvider,
} from "./openai-analysis-provider";

vi.mock("server-only", () => ({}));

const stage1Input: Stage1Input = {
  rawCommentId: "raw-1",
  sourceText: "영상이 너무 어두워요",
  videoTitle: "촬영 비하인드",
  threadContext: [],
  ruleEvaluation: {
    normalizedText: "영상이너무어두워요",
    signals: [],
    initialReviewLevel: "safe",
    engineVersion: "rules-v1",
  },
  creatorPolicy: {
    version: 1,
    sensitivity: "standard",
    preferredActions: {
      caution: "review",
      risk: "hold_for_review",
    },
    harmfulTextHidden: true,
    phraseRules: [],
  },
};

describe("OpenAI analysis provider", () => {
  it("uses Responses API structured output and returns run metadata", async () => {
    const parse = vi.fn().mockResolvedValue({
      id: "resp-1",
      model: "configured-model",
      output_parsed: {
        category: "constructive_feedback",
        confidence: 0.86,
        reviewLevel: "safe",
        toxicity: 0,
        spam: 0,
        phishing: 0,
        actionableFeedback: true,
        needsSecondPass: false,
        secondPassReasons: [],
        recommendedAction: "none",
        explanation: "The comment contains actionable video feedback.",
      },
      usage: {
        input_tokens: 40,
        output_tokens: 20,
        total_tokens: 60,
        input_tokens_details: {
          cached_tokens: 0,
          cache_write_tokens: 0,
        },
        output_tokens_details: { reasoning_tokens: 0 },
      },
    });
    const provider = createOpenAIAnalysisProvider({
      client: {
        responses: { parse },
        embeddings: { create: vi.fn() },
      },
      stageOneModel: "stage-one-model",
      stageTwoModel: "stage-two-model",
      embeddingModel: "embedding-model",
    });

    const result = await provider.classifyStage1(stage1Input);

    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "stage-one-model",
        input: expect.arrayContaining([
          expect.objectContaining({ role: "system" }),
          expect.objectContaining({ role: "user" }),
        ]),
        text: expect.objectContaining({
          format: expect.objectContaining({
            type: "json_schema",
            name: "comment_stage_1",
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      provider: "openai",
      providerResponseId: "resp-1",
      modelIdentifier: "configured-model",
      usage: {
        inputTokens: 40,
        outputTokens: 20,
        totalTokens: 60,
      },
    });
  });

  it("uses the separate stage-two model", async () => {
    const parse = vi.fn().mockResolvedValue({
      id: "resp-2",
      model: "stage-two-model",
      output_parsed: {
        category: "constructive_feedback",
        confidence: 0.92,
        reviewLevel: "caution",
        toxicity: 0.1,
        spam: 0,
        phishing: 0,
        actionableFeedback: true,
        recommendedAction: "review",
        explanation: "Useful feedback.",
        sanitizedFeedback: "영상 밝기를 높여 달라는 요청",
        normalizedQuestion: null,
        manualReview: true,
        evidenceReview: false,
      },
      usage: {
        input_tokens: 80,
        output_tokens: 30,
        total_tokens: 110,
      },
    });
    const provider = createOpenAIAnalysisProvider({
      client: {
        responses: { parse },
        embeddings: { create: vi.fn() },
      },
      stageOneModel: "stage-one-model",
      stageTwoModel: "stage-two-model",
      embeddingModel: "embedding-model",
    });

    await provider.classifyStage2({
      ...stage1Input,
      stage1: {
        category: "constructive_feedback",
        confidence: 0.8,
        reviewLevel: "caution",
        toxicity: 0.1,
        spam: 0,
        phishing: 0,
        actionableFeedback: true,
        needsSecondPass: true,
        secondPassReasons: ["low confidence"],
        recommendedAction: "review",
        explanation: "Potential feedback.",
      },
      retrievedFeedback: [],
      triggerReasons: ["low_confidence"],
    });

    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: "stage-two-model" }),
    );
  });

  it("throws a schema error when parsed output is missing", async () => {
    const provider = createOpenAIAnalysisProvider({
      client: {
        responses: {
          parse: vi.fn().mockResolvedValue({
            id: "resp-missing",
            model: "configured-model",
            output_parsed: null,
            usage: null,
          }),
        },
        embeddings: { create: vi.fn() },
      },
      stageOneModel: "stage-one-model",
      stageTwoModel: "stage-two-model",
      embeddingModel: "embedding-model",
    });

    await expect(provider.classifyStage1(stage1Input)).rejects.toBeInstanceOf(
      AnalysisSchemaError,
    );
  });
});
