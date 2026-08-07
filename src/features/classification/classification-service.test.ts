import { describe, expect, it, vi } from "vitest";

import type { FirstPassResult, ModelRun } from "./contracts";
import {
  createClassificationService,
  type ClassificationJobRepository,
  type ClassificationWorkItem,
  type StoredClassificationState,
} from "./classification-service";
import { DEFAULT_CLASSIFICATION_PROFILE, type TerraVerdict } from "./schemas";

const item: ClassificationWorkItem = {
  id: "item-1",
  workspaceId: "workspace-1",
  rawCommentId: "comment-1",
  sourceText: "좋은 영상 감사합니다",
  videoTitle: "테스트 영상",
  channelId: "channel-1",
  policyVersion: 1,
  profile: DEFAULT_CLASSIFICATION_PROFILE,
  similarExamples: [],
};

const lunaRun: ModelRun = {
  model: "gpt-5.6-luna",
  responseId: "resp-luna",
  latencyMs: 20,
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
};

const firstPassResult = (
  candidateLevel: "safe" | "caution" | "danger",
  options?: { moderation?: "clean" | "flagged" | "unavailable" },
): FirstPassResult => ({
  commentId: item.rawCommentId,
  workspaceId: item.workspaceId,
  moderation:
    options?.moderation === "unavailable"
      ? null
      : {
          result: {
            flagged: options?.moderation === "flagged",
            categories:
              options?.moderation === "flagged" ? ["harassment"] : [],
            unknownCategories: [],
            categoryScores: {
              harassment: options?.moderation === "flagged" ? 0.91 : 0.01,
            },
          },
          model: "omni-moderation-latest",
          latencyMs: 8,
        },
  luna: {
    result: {
      candidateLevel,
      certainty: "clear",
      feedbackPresent: candidateLevel !== "safe",
      locationOrScheduleMention: false,
      sensitiveTopicMatched: false,
      hardRiskFlags:
        candidateLevel === "danger" ? ["personal_attack"] : [],
      softRiskFlags:
        candidateLevel === "caution" ? ["harsh_criticism"] : [],
      matchedRules: [],
    },
    run: lunaRun,
  },
  promptVersion: "luna-v1",
  evaluatedAt: "2026-08-07T00:00:00.000Z",
});

const terraResult: TerraVerdict = {
  verdictLevel: "caution",
  certainty: "clear",
  reasonCodes: ["mockery"],
  hardRiskFlags: [],
  softRiskFlags: ["mockery"],
  feedbackType: "actionable",
  feedbackActionable: true,
  feedbackCore: "편집 흐름이 끊긴다",
  recommendedActions: ["show_rewritten_only"],
  safetyCase: false,
};

const terraRun: ModelRun = {
  model: "gpt-5.6-terra",
  responseId: "resp-terra",
  latencyMs: 35,
  usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
};

const createMemoryRepository = (initial?: StoredClassificationState) => {
  const state: StoredClassificationState =
    initial ?? { firstPass: null, branch: null, terra: null, verdict: null };
  let completed = false;
  let failed: string | null = null;

  const repository: ClassificationJobRepository = {
    claimItems: vi.fn(async () => [item]),
    loadState: vi.fn(async () => state),
    saveFirstPass: vi.fn(async (_item, result) => {
      state.firstPass = result;
    }),
    saveBranch: vi.fn(async (_item, branch) => {
      state.branch = branch;
    }),
    saveTerra: vi.fn(async (_item, result) => {
      state.terra = result;
    }),
    saveVerdict: vi.fn(async (_item, result) => {
      state.verdict = result;
    }),
    completeItem: vi.fn(async () => {
      completed = true;
    }),
    failItem: vi.fn(async (_itemId, errorCode) => {
      failed = errorCode;
    }),
    refreshJobProgress: vi.fn(async () => ({
      status: failed ? "failed" : completed ? "succeeded" : "running",
      total: 1,
      completed: completed ? 1 : 0,
      failed: failed ? 1 : 0,
      remaining: completed || failed ? 0 : 1,
    })),
  };

  return {
    repository,
    state,
    get completed() {
      return completed;
    },
    get failed() {
      return failed;
    },
  };
};

describe("classification job service", () => {
  it("stores an explicit safe verdict without calling Terra", async () => {
    const memory = createMemoryRepository();
    const firstPass = { run: vi.fn(async () => firstPassResult("safe")) };
    const secondPass = { verify: vi.fn() };
    const service = createClassificationService({
      firstPass,
      secondPass,
      repository: memory.repository,
    });

    await service.processChunk("job-1", 5);

    expect(memory.state.branch?.kind).toBe("instant_safe");
    expect(memory.state.verdict?.verdict).toMatchObject({
      status: "decided",
      level: "safe",
      basis: "instant_safe",
    });
    expect(memory.completed).toBe(true);
    expect(secondPass.verify).not.toHaveBeenCalled();
  });

  it("stores Terra's values and the final verdict for a verify branch", async () => {
    const memory = createMemoryRepository();
    const service = createClassificationService({
      firstPass: {
        run: vi.fn(async () => firstPassResult("caution", { moderation: "flagged" })),
      },
      secondPass: {
        promptVersion: "terra-v1",
        verify: vi.fn(async () => ({ result: terraResult, run: terraRun })),
      },
      repository: memory.repository,
    });

    await service.processChunk("job-1", 5);

    expect(memory.state.branch).toMatchObject({
      kind: "verify",
      reasons: ["luna_caution", "moderation_flagged"],
    });
    expect(memory.state.terra?.result).toEqual(terraResult);
    expect(memory.state.verdict).toMatchObject({
      reasonCodes: ["mockery"],
      feedbackCore: "편집 흐름이 끊긴다",
      verdict: { status: "decided", level: "caution" },
    });
  });

  it("forces Terra when Moderation was unavailable", async () => {
    const memory = createMemoryRepository();
    const verify = vi.fn(async () => ({ result: terraResult, run: terraRun }));
    const service = createClassificationService({
      firstPass: {
        run: vi.fn(async () =>
          firstPassResult("safe", { moderation: "unavailable" }),
        ),
      },
      secondPass: { promptVersion: "terra-v1", verify },
      repository: memory.repository,
    });

    await service.processChunk("job-1", 5);

    expect(memory.state.branch).toMatchObject({
      kind: "verify",
      reasons: ["moderation_unavailable"],
    });
    expect(verify).toHaveBeenCalledOnce();
  });

  it("reuses a stored final verdict without calling either model", async () => {
    const stored = createMemoryRepository({
      firstPass: firstPassResult("safe"),
      branch: {
        kind: "instant_safe",
        level: "safe",
        basis: "luna_safe",
        certainty: "clear",
      },
      terra: null,
      verdict: {
        verdict: {
          status: "decided",
          level: "safe",
          basis: "instant_safe",
          agreedWithFirstPass: null,
          allowRewrite: false,
          hideSource: false,
          recommendedActions: ["show_source"],
          safetyCase: false,
          raisedByModeration: false,
        },
        reasonCodes: [],
        feedbackType: "none",
        feedbackCore: null,
      },
    });
    const firstPass = { run: vi.fn() };
    const secondPass = { verify: vi.fn() };
    const service = createClassificationService({
      firstPass,
      secondPass,
      repository: stored.repository,
    });

    await service.processChunk("job-1", 5);

    expect(firstPass.run).not.toHaveBeenCalled();
    expect(secondPass.verify).not.toHaveBeenCalled();
    expect(stored.completed).toBe(true);
  });

  it("stores a stable failure code when Luna fails", async () => {
    const memory = createMemoryRepository();
    const service = createClassificationService({
      firstPass: {
        run: vi.fn(async () => {
          throw new Error("luna_unavailable");
        }),
      },
      secondPass: { verify: vi.fn() },
      repository: memory.repository,
    });

    await service.processChunk("job-1", 5);

    expect(memory.failed).toBe("classification_failed");
    expect(memory.state.verdict).toBeNull();
  });
});
