import { describe, expect, it, vi } from "vitest";

import type { FirstPassInput } from "./contracts";
import { createFirstPassRunner } from "./first-pass";
import type { LunaFirstPassClassifier } from "./luna-first-pass";
import type { ModerationScreen } from "./moderation";
import { DEFAULT_CLASSIFICATION_PROFILE } from "./schemas";

const input: FirstPassInput = {
  commentId: "comment-1",
  workspaceId: "workspace-1",
  sourceText: "편집 개느리네.",
  videoTitle: "초보자를 위한 노션 정리법 10분 완성",
  channelId: "channel-1",
  profile: DEFAULT_CLASSIFICATION_PROFILE,
  similarExamples: [],
};

const lunaReturning = (
  candidateLevel: "safe" | "caution" | "danger" = "caution",
) =>
  ({
    promptVersion: "crowdsift-luna-first-pass-v1",
    classify: vi.fn().mockResolvedValue({
      result: {
        candidateLevel,
        certainty: "borderline",
        feedbackPresent: true,
        locationOrScheduleMention: false,
        sensitiveTopicMatched: false,
        hardRiskFlags: [],
        softRiskFlags: ["profanity"],
        matchedRules: [],
      },
      run: {
        model: "gpt-5.6-luna",
        responseId: "resp-1",
        latencyMs: 120,
        usage: { inputTokens: 210, outputTokens: 40, totalTokens: 250 },
      },
    }),
  }) as unknown as LunaFirstPassClassifier;

const moderationReturning = (flagged: boolean) =>
  ({
    screen: vi.fn().mockResolvedValue({
      result: {
        flagged,
        categories: flagged ? ["harassment"] : [],
        unknownCategories: [],
        categoryScores: { harassment: flagged ? 0.9 : 0.01 },
      },
      model: "omni-moderation-latest",
      latencyMs: 40,
    }),
  }) as unknown as ModerationScreen;

describe("first pass runner", () => {
  it("keeps both answers side by side instead of merging them", async () => {
    const runner = createFirstPassRunner({
      luna: lunaReturning("caution"),
      moderation: moderationReturning(true),
      now: () => new Date("2026-08-04T00:00:00.000Z"),
    });

    const result = await runner.run(input);

    expect(result.luna.result.candidateLevel).toBe("caution");
    expect(result.moderation?.result.flagged).toBe(true);
    expect(result.moderation?.result.categories).toEqual(["harassment"]);
    // Deciding the final level is the branch step's job, so nothing here may
    // claim to be the verdict.
    expect(result).not.toHaveProperty("finalLevel");
    expect(result.promptVersion).toBe("crowdsift-luna-first-pass-v1");
    expect(result.evaluatedAt).toBe("2026-08-04T00:00:00.000Z");
  });

  it("runs the free filter and the classifier at the same time", async () => {
    const order: string[] = [];
    const luna = {
      promptVersion: "crowdsift-luna-first-pass-v1",
      classify: vi.fn(async () => {
        order.push("luna:start");
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push("luna:end");
        return {
          result: {
            candidateLevel: "safe" as const,
            certainty: "clear",
            feedbackPresent: false,
            locationOrScheduleMention: false,
            sensitiveTopicMatched: false,
            hardRiskFlags: [],
            softRiskFlags: [],
            matchedRules: [],
          },
          run: {
            model: "gpt-5.6-luna",
            responseId: "resp-1",
            latencyMs: 10,
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          },
        };
      }),
    } as unknown as LunaFirstPassClassifier;
    const moderation = {
      screen: vi.fn(async () => {
        order.push("moderation:start");
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push("moderation:end");
        return {
          result: {
            flagged: false,
            categories: [],
            unknownCategories: [],
            categoryScores: {},
          },
          model: "omni-moderation-latest",
          latencyMs: 10,
        };
      }),
    } as unknown as ModerationScreen;

    await createFirstPassRunner({ luna, moderation }).run(input);

    expect(order.slice(0, 2)).toEqual(["moderation:start", "luna:start"]);
  });

  it("still classifies when the free filter fails", async () => {
    const onModerationError = vi.fn();
    const runner = createFirstPassRunner({
      luna: lunaReturning("caution"),
      moderation: {
        screen: vi.fn().mockRejectedValue(new Error("moderation_unavailable")),
      } as unknown as ModerationScreen,
      onModerationError,
    });

    const result = await runner.run(input);

    expect(result.luna.result.candidateLevel).toBe("caution");
    // An empty result would read as "nothing risky found", so an outage must be
    // recorded as "not checked" instead.
    expect(result.moderation).toBeNull();
    expect(onModerationError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "moderation_unavailable" }),
      "comment-1",
    );
  });

  it("fails when the classifier itself fails", async () => {
    const runner = createFirstPassRunner({
      luna: {
        promptVersion: "crowdsift-luna-first-pass-v1",
        classify: vi.fn().mockRejectedValue(new Error("luna_unavailable")),
      } as unknown as LunaFirstPassClassifier,
      moderation: moderationReturning(false),
    });

    await expect(runner.run(input)).rejects.toThrow("luna_unavailable");
  });
});
