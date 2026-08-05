import { describe, expect, it, vi } from "vitest";

import type { SecondPassInput } from "./contracts";
import { ClassificationSchemaError, type ResponsesClient } from "./luna-first-pass";
import { createTerraVerification } from "./terra-verification";

const clientReturning = (parsed: unknown) => {
  const parse = vi.fn().mockResolvedValue({
    id: "resp-terra-1",
    model: "gpt-5.6-terra",
    output_parsed: parsed,
    usage: { input_tokens: 480, output_tokens: 90, total_tokens: 570 },
  });

  return { client: { responses: { parse } } as ResponsesClient, parse };
};

const validOutput = {
  verdictLevel: "caution",
  certainty: "clear",
  reasonCodes: ["vulgarity"],
  hardRiskFlags: [],
  softRiskFlags: ["vulgarity"],
  feedbackType: "actionable",
  feedbackActionable: true,
  feedbackCore: "편집 속도가 느리다",
  recommendedActions: ["hide_source", "show_rewritten_only"],
  safetyCase: false,
};

const input: SecondPassInput = {
  commentId: "comment-1",
  workspaceId: "workspace-1",
  sourceText: "편집 개느리네.",
  videoTitle: "초보자를 위한 노션 정리법",
  channelId: "channel-1",
  profile: {
    protectionLevel: "standard",
    allowedSlang: [],
    sensitiveTopics: [],
    hidePersonalAttacks: true,
    rewriteTone: "friendly",
    emojiFrequency: "low",
  },
  similarExamples: [],
  moderation: {
    flagged: true,
    categories: ["harassment"],
    unknownCategories: ["brand-new/category"],
    categoryScores: { harassment: 0.62 },
  },
};

describe("terra verification", () => {
  it("returns its own verdict and the material behind it", async () => {
    const { client } = clientReturning(validOutput);

    const { result, run } = await createTerraVerification({
      client,
      model: "gpt-5.6-terra",
    }).verify(input);

    expect(result.verdictLevel).toBe("caution");
    expect(result.feedbackCore).toBe("편집 속도가 느리다");
    expect(result.recommendedActions).toEqual([
      "hide_source",
      "show_rewritten_only",
    ]);
    expect(run.usage.totalTokens).toBe(570);
  });

  /** 모델이 이 댓글에 대해 받는 자료. 프롬프트나 출력 스키마는 제외한다. */
  const materialSentFor = async (payload: SecondPassInput) => {
    const { client, parse } = clientReturning(validOutput);

    await createTerraVerification({
      client,
      model: "gpt-5.6-terra",
    }).verify(payload);

    const sent = parse.mock.calls[0]![0] as {
      input: Array<{ role: string; content: string }>;
    };

    return sent.input.find((message) => message.role === "user")!.content;
  };

  it("never carries the first pass verdict into the material", async () => {
    const material = await materialSentFor(input);

    // Showing the model an earlier answer pulls it toward that answer, which
    // turns the second pass into a rubber stamp and empties the "two judgements
    // disagree" rule of any meaning.
    for (const leak of [
      "candidateLevel",
      "certainty",
      "luna",
      "feedbackPresent",
      "locationOrScheduleMention",
      "matchedRules",
    ]) {
      expect(material).not.toContain(leak);
    }
  });

  it("passes the free filter result through, since that is a fact", async () => {
    const material = await materialSentFor(input);

    expect(material).toContain("harassment");
    // An unrecognised category is a risk signal too, so it travels with the rest.
    expect(material).toContain("brand-new/category");
  });

  it("says the filter never answered rather than saying it found nothing", async () => {
    const material = await materialSentFor({ ...input, moderation: null });

    expect(JSON.parse(material)).toMatchObject({ moderation: null });
  });

  it("reasons about the comment rather than answering straight away", async () => {
    const { client, parse } = clientReturning(validOutput);

    await createTerraVerification({
      client,
      model: "gpt-5.6-terra",
    }).verify(input);

    // The plan asks the second pass to differ from the first in at least one
    // respect. Model and reasoning effort are two of them.
    expect(parse.mock.calls[0]![0]).toMatchObject({
      reasoning: { effort: "low" },
    });
  });

  it("says so when the answer does not match the contract", async () => {
    const { client } = clientReturning({
      ...validOutput,
      verdictLevel: "unknown_level",
    });

    await expect(
      createTerraVerification({ client, model: "gpt-5.6-terra" }).verify(input),
    ).rejects.toThrow(ClassificationSchemaError);
  });
});
