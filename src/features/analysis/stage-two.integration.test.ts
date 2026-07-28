import { describe, expect, it, vi } from "vitest";

import type { AnalysisProvider } from "./analysis-provider";
import {
  createAnalysisService,
  type AnalysisRepository,
} from "./analysis-service";

const workItem = {
  id: "item-1",
  workspaceId: "workspace-1",
  rawCommentId: "raw-1",
  sourceText: "진짜 잘도 만들었다. 그런데 자막이 너무 작아.",
  videoTitle: "새 영상",
  threadContext: [],
  policy: {
    version: 1,
    sensitivity: "standard",
    preferredActions: {
      caution: "review",
      risk: "hold_for_review",
    },
    harmfulTextHidden: true,
    phraseRules: [],
  },
  phraseRules: [],
} as const;

const progress = {
  status: "succeeded" as const,
  total: 1,
  completed: 1,
  failed: 0,
  remaining: 0,
};

describe("stage-two analysis integration", () => {
  it("inserts a new final analysis without updating stage one", async () => {
    const repository: AnalysisRepository & {
      updateHistoricalAnalysis: ReturnType<typeof vi.fn>;
    } = {
      claimPendingItems: vi.fn().mockResolvedValue({
        job: {
          id: "job-1",
          workspaceId: "workspace-1",
          status: "pending",
          total: 1,
          completed: 0,
          failed: 0,
        },
        items: [workItem],
      }),
      insertRuleEvaluation: vi.fn().mockResolvedValue("rule-evaluation-1"),
      insertModelRun: vi
        .fn()
        .mockResolvedValueOnce("stage1-run")
        .mockResolvedValueOnce("stage2-run"),
      insertFailedModelRun: vi.fn(),
      insertAnalysis: vi.fn().mockResolvedValue("stage1-analysis"),
      insertStageTwoAnalysis: vi.fn().mockResolvedValue("stage2-analysis"),
      insertSanitizedFeedback: vi.fn().mockResolvedValue(undefined),
      completeItem: vi.fn(),
      failItem: vi.fn(),
      refreshJobProgress: vi.fn().mockResolvedValue(progress),
      updateHistoricalAnalysis: vi.fn(),
    };
    const provider: AnalysisProvider = {
      classifyStage1: vi.fn().mockResolvedValue({
        output: {
          category: "toxic_but_actionable",
          confidence: 0.81,
          reviewLevel: "caution",
          toxicity: 0.7,
          spam: 0,
          phishing: 0,
          actionableFeedback: true,
          needsSecondPass: true,
          secondPassReasons: ["sarcasm"],
          recommendedAction: "review",
          explanation: "Potentially useful feedback in hostile wording.",
        },
        provider: "openai",
        modelIdentifier: "model",
        providerResponseId: "stage1-response",
        latencyMs: 10,
        usage: {},
      }),
      classifyStage2: vi.fn().mockResolvedValue({
        output: {
          category: "constructive_feedback",
          confidence: 0.93,
          reviewLevel: "caution",
          toxicity: 0.4,
          spam: 0,
          phishing: 0,
          actionableFeedback: true,
          recommendedAction: "review",
          explanation: "The useful signal is a subtitle-size request.",
          sanitizedFeedback: "자막 크기를 키워 달라는 요청",
          normalizedQuestion: null,
          manualReview: true,
          evidenceReview: false,
        },
        provider: "openai",
        modelIdentifier: "model",
        providerResponseId: "stage2-response",
        latencyMs: 12,
        usage: {},
      }),
      embed: vi.fn(),
      summarizeDashboard: vi.fn(),
    };
    const retrieveCreatorExamples = vi.fn().mockResolvedValue([
      {
        feedbackId: "feedback-1",
        similarity: 0.82,
        decision: "corrected",
        correctedCategory: "constructive_feedback",
        correctedReviewLevel: "caution",
        editedSanitizedFeedback: "자막 개선 요청",
      },
    ]);
    const service = createAnalysisService({
      provider,
      repository,
      modelVersion: "model",
      retryBaseDelayMs: 0,
      retrieveCreatorExamples,
    });

    await service.processAnalysisChunk("job-1", 1);

    expect(repository.insertAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 1 }),
    );
    expect(repository.insertStageTwoAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 2,
        stageOneAnalysisId: "stage1-analysis",
        retrievedFeedback: [
          expect.objectContaining({
            feedbackId: "feedback-1",
            similarity: 0.82,
          }),
        ],
      }),
    );
    expect(repository.insertSanitizedFeedback).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      analysisId: "stage2-analysis",
      neutralText: "자막 크기를 키워 달라는 요청",
      normalizedQuestion: null,
      noSignal: false,
    });
    expect(repository.updateHistoricalAnalysis).not.toHaveBeenCalled();
  });

  it("records a failed second pass with stage-two provenance", async () => {
    const repository: AnalysisRepository = {
      claimPendingItems: vi.fn().mockResolvedValue({
        job: {
          id: "job-1",
          workspaceId: "workspace-1",
          status: "pending",
          total: 1,
          completed: 0,
          failed: 0,
        },
        items: [workItem],
      }),
      insertRuleEvaluation: vi.fn().mockResolvedValue("rule-evaluation-1"),
      insertModelRun: vi.fn().mockResolvedValue("stage1-run"),
      insertFailedModelRun: vi.fn(),
      insertAnalysis: vi.fn().mockResolvedValue("stage1-analysis"),
      insertStageTwoAnalysis: vi.fn(),
      insertSanitizedFeedback: vi.fn(),
      completeItem: vi.fn(),
      failItem: vi.fn(),
      refreshJobProgress: vi.fn().mockResolvedValue({
        ...progress,
        status: "failed",
        completed: 0,
        failed: 1,
      }),
    };
    const provider: AnalysisProvider = {
      classifyStage1: vi.fn().mockResolvedValue({
        output: {
          category: "toxic_but_actionable",
          confidence: 0.81,
          reviewLevel: "caution",
          toxicity: 0.7,
          spam: 0,
          phishing: 0,
          actionableFeedback: true,
          needsSecondPass: true,
          secondPassReasons: ["sarcasm"],
          recommendedAction: "review",
          explanation: "Potentially useful feedback in hostile wording.",
        },
        provider: "openai",
        modelIdentifier: "model",
        providerResponseId: "stage1-response",
        latencyMs: 10,
        usage: {},
      }),
      classifyStage2: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("bad request"), { status: 400 })),
      embed: vi.fn(),
      summarizeDashboard: vi.fn(),
    };
    const service = createAnalysisService({
      provider,
      repository,
      modelVersion: "model",
      retryBaseDelayMs: 0,
      retrieveCreatorExamples: vi.fn().mockResolvedValue([]),
    });

    await service.processAnalysisChunk("job-1", 1);

    expect(repository.insertFailedModelRun).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 2,
        promptVersion: "commenthawk-stage2-v1",
      }),
    );
    expect(repository.failItem).toHaveBeenCalledWith("item-1", "INTERNAL");
    expect(repository.completeItem).not.toHaveBeenCalled();
  });
});
