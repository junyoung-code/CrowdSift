import { describe, expect, it, vi } from "vitest";

import type { AnalysisProvider } from "./analysis-provider";
import {
  createAnalysisService,
  type AnalysisRepository,
} from "./analysis-service";
import { AnalysisSchemaError } from "./analysis-errors";

const stage1ModelResult = {
  output: {
    category: "toxic_but_actionable",
    confidence: 0.9,
    reviewLevel: "safe",
    toxicity: 0.82,
    spam: 0,
    phishing: 0,
    actionableFeedback: true,
    needsSecondPass: true,
    secondPassReasons: ["creator context required"],
    recommendedAction: "review",
    explanation: "The comment is hostile but includes actionable feedback.",
  },
  provider: "openai",
  modelIdentifier: "configured-model",
  providerResponseId: "resp-1",
  latencyMs: 42,
  usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60 },
} as const;

const workItem = {
  id: "item-1",
  workspaceId: "workspace-1",
  rawCommentId: "raw-1",
  sourceText: "말은 거칠지만 영상 소리가 너무 작아요",
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
  phraseRules: [
    {
      id: "blocked-1",
      kind: "blocked",
      normalizedPhrase: "말은거칠지만",
      contextNote: null,
      enabled: true,
      version: 1,
    },
  ],
} as const;

const createRepository = (): AnalysisRepository & {
  updateRawComment: ReturnType<typeof vi.fn>;
} => ({
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
  insertModelRun: vi.fn().mockResolvedValue("model-run-1"),
  insertAnalysis: vi.fn().mockResolvedValue("analysis-1"),
  completeItem: vi.fn().mockResolvedValue(undefined),
  failItem: vi.fn().mockResolvedValue(undefined),
  insertFailedModelRun: vi.fn().mockResolvedValue(undefined),
  refreshJobProgress: vi.fn().mockResolvedValue({
    status: "succeeded",
    total: 1,
    completed: 1,
    failed: 0,
    remaining: 0,
  }),
  updateRawComment: vi.fn(),
});

const createProvider = (): AnalysisProvider => ({
  classifyStage1: vi.fn().mockResolvedValue(stage1ModelResult),
  classifyStage2: vi.fn(),
  embed: vi.fn(),
  summarizeDashboard: vi.fn(),
});

describe("analysis service", () => {
  it("persists the model run and stage-one analysis separately", async () => {
    const provider = createProvider();
    const repository = createRepository();
    const service = createAnalysisService({
      provider,
      repository,
      modelVersion: "configured-model",
      retryBaseDelayMs: 0,
    });

    await service.processAnalysisChunk("job-1", 5);

    expect(repository.insertModelRun).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 1,
        promptVersion: "commenthawk-stage1-v1",
      }),
    );
    expect(repository.insertAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 1,
        reviewLevel: "caution",
        manualReview: true,
      }),
    );
    expect(repository.updateRawComment).not.toHaveBeenCalled();
    expect(repository.completeItem).toHaveBeenCalledWith("item-1");
  });

  it("retries one schema failure then records a per-item failure", async () => {
    const provider = createProvider();
    vi.mocked(provider.classifyStage1)
      .mockRejectedValueOnce(new AnalysisSchemaError("invalid one"))
      .mockRejectedValueOnce(new AnalysisSchemaError("invalid two"));
    const repository = createRepository();
    const service = createAnalysisService({
      provider,
      repository,
      modelVersion: "configured-model",
      retryBaseDelayMs: 0,
    });

    await service.processAnalysisChunk("job-1", 1);

    expect(provider.classifyStage1).toHaveBeenCalledTimes(2);
    expect(repository.failItem).toHaveBeenCalledWith(
      "item-1",
      "SCHEMA_INVALID",
    );
    expect(repository.insertAnalysis).not.toHaveBeenCalled();
  });

  it("does not retrieve creator examples for a clean stage-one result", async () => {
    const provider = createProvider();
    vi.mocked(provider.classifyStage1).mockResolvedValue({
      ...stage1ModelResult,
      output: {
        ...stage1ModelResult.output,
        category: "question",
        confidence: 0.95,
        reviewLevel: "safe",
        toxicity: 0,
        actionableFeedback: false,
        needsSecondPass: false,
        secondPassReasons: [],
        recommendedAction: "none",
      },
    });
    const repository = createRepository();
    vi.mocked(repository.claimPendingItems).mockResolvedValue({
      job: {
        id: "job-1",
        workspaceId: "workspace-1",
        status: "pending",
        total: 1,
        completed: 0,
        failed: 0,
      },
      items: [
        {
          ...workItem,
          threadContext: [...workItem.threadContext],
          policy: {
            ...workItem.policy,
            phraseRules: [...workItem.policy.phraseRules],
          },
          phraseRules: [],
        },
      ],
    });
    repository.insertStageTwoAnalysis = vi.fn();
    repository.insertSanitizedFeedback = vi.fn();
    const retrieveCreatorExamples = vi.fn().mockResolvedValue([]);
    const service = createAnalysisService({
      provider,
      repository,
      modelVersion: "configured-model",
      retryBaseDelayMs: 0,
      retrieveCreatorExamples,
    });

    await service.processAnalysisChunk("job-1", 1);

    expect(retrieveCreatorExamples).not.toHaveBeenCalled();
    expect(provider.classifyStage2).not.toHaveBeenCalled();
  });
});
