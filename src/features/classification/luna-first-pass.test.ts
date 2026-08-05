import { describe, expect, it, vi } from "vitest";

import type { FirstPassInput } from "./contracts";
import {
  ClassificationSchemaError,
  createLunaFirstPass,
  type ResponsesClient,
} from "./luna-first-pass";
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

const clientReturning = (parsed: unknown) =>
  ({
    responses: {
      parse: vi.fn().mockResolvedValue({
        id: "resp-1",
        model: "gpt-5.6-luna",
        output_parsed: parsed,
        usage: { input_tokens: 210, output_tokens: 40, total_tokens: 250 },
      }),
    },
  }) as unknown as ResponsesClient;

const validOutput = {
  candidateLevel: "caution",
  confidence: 0.72,
  feedbackPresent: true,
  locationOrScheduleMention: false,
  sensitiveTopicMatched: false,
  hardRiskFlags: [],
  softRiskFlags: ["profanity"],
  matchedRules: [],
};

describe("luna first pass", () => {
  it("returns the candidate level and the signals behind it", async () => {
    const luna = createLunaFirstPass({
      client: clientReturning(validOutput),
      model: "gpt-5.6-luna",
    });

    const { result, run } = await luna.classify(input);

    expect(result.candidateLevel).toBe("caution");
    expect(result.softRiskFlags).toEqual(["profanity"]);
    expect(result.feedbackPresent).toBe(true);
    expect(result.locationOrScheduleMention).toBe(false);
    expect(run.model).toBe("gpt-5.6-luna");
    expect(run.usage.totalTokens).toBe(250);
  });

  it("carries a location hint even when the level stays safe", async () => {
    const luna = createLunaFirstPass({
      client: clientReturning({
        ...validOutput,
        candidateLevel: "safe",
        confidence: 0.91,
        softRiskFlags: [],
        // "집 근처에서 봤어요" reads as friendly on its own, so the level stays
        // safe while the hint keeps it out of the instant-pass lane.
        locationOrScheduleMention: true,
      }),
      model: "gpt-5.6-luna",
    });

    const { result } = await luna.classify({
      ...input,
      sourceText: "오늘도 집 근처에서 봤어요.",
    });

    expect(result.candidateLevel).toBe("safe");
    expect(result.hardRiskFlags).toEqual([]);
    expect(result.locationOrScheduleMention).toBe(true);
  });

  it("sends the comment with the channel profile and past examples", async () => {
    const client = clientReturning(validOutput);
    const luna = createLunaFirstPass({ client, model: "gpt-5.6-luna" });

    await luna.classify({
      ...input,
      profile: {
        ...DEFAULT_CLASSIFICATION_PROFILE,
        allowedSlang: ["개웃기다"],
      },
      similarExamples: [
        { text: "개웃기다", level: "safe", similarity: 0.9, note: "채널 밈" },
      ],
    });

    const request = vi.mocked(client.responses.parse).mock.calls[0]![0]!;
    const userMessage = (
      request.input as Array<{ role: string; content: string }>
    ).find((message) => message.role === "user")!;
    const payload = JSON.parse(userMessage.content) as Record<string, unknown>;

    expect(payload.comment).toBe("편집 개느리네.");
    expect(payload.videoTitle).toBe("초보자를 위한 노션 정리법 10분 완성");
    expect(payload).toHaveProperty("profile.allowedSlang", ["개웃기다"]);
    expect(payload.similarExamples).toEqual([
      { text: "개웃기다", level: "safe", note: "채널 밈" },
    ]);
  });

  it("does not ask the model whether a second pass is needed", async () => {
    const client = clientReturning(validOutput);

    await createLunaFirstPass({ client, model: "gpt-5.6-luna" }).classify(input);

    const request = vi.mocked(client.responses.parse).mock.calls[0]![0]!;
    // Routing to Terra is a code decision, so the schema must not carry the model's
    // own opinion about it.
    expect(JSON.stringify(request.text)).not.toContain("econdPass");
    expect(JSON.stringify(request.text)).not.toContain("equiresSecond");
  });

  it("rejects an output that does not match the contract", async () => {
    const luna = createLunaFirstPass({
      client: clientReturning({ ...validOutput, candidateLevel: "risk" }),
      model: "gpt-5.6-luna",
    });

    await expect(luna.classify(input)).rejects.toBeInstanceOf(
      ClassificationSchemaError,
    );
  });

  it("rejects a missing parsed output", async () => {
    const luna = createLunaFirstPass({
      client: clientReturning(null),
      model: "gpt-5.6-luna",
    });

    await expect(luna.classify(input)).rejects.toThrow(
      "Luna returned no parsed output",
    );
  });
});
