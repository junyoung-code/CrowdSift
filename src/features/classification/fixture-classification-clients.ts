import "server-only";

import { createFirstPassRunner, type FirstPassRunner } from "./first-pass";
import { createLunaFirstPass, type ResponsesClient } from "./luna-first-pass";
import { createModerationScreen, type ModerationClient } from "./moderation";
import type { LunaFirstPass, TerraVerdict } from "./schemas";
import {
  createTerraVerification,
  type TerraVerification,
} from "./terra-verification";

type FixtureStage = "luna" | "terra";

const threatPattern = /가만두지|찾아가서|죽어|죽여|위협/;
const cautionPattern = /광고|느리|소리|어두워|왜 이렇게|자막/;

const sourceTextFromRequest = (request: Record<string, unknown>) => {
  const messages = Array.isArray(request.input) ? request.input : [];
  const userMessage = messages.find(
    (message): message is { role: string; content: string } =>
      typeof message === "object" &&
      message !== null &&
      "role" in message &&
      message.role === "user" &&
      "content" in message &&
      typeof message.content === "string",
  );

  if (!userMessage) return "";

  try {
    const parsed = JSON.parse(userMessage.content) as { comment?: unknown };
    return typeof parsed.comment === "string" ? parsed.comment : "";
  } catch {
    return "";
  }
};

const lunaOutputFor = (sourceText: string): LunaFirstPass => {
  if (threatPattern.test(sourceText)) {
    return {
      candidateLevel: "danger",
      certainty: "clear",
      feedbackPresent: false,
      locationOrScheduleMention: true,
      sensitiveTopicMatched: false,
      hardRiskFlags: ["threat"],
      softRiskFlags: [],
      matchedRules: ["fixture:threat"],
    };
  }

  if (cautionPattern.test(sourceText)) {
    return {
      candidateLevel: "caution",
      certainty: "clear",
      feedbackPresent: true,
      locationOrScheduleMention: false,
      sensitiveTopicMatched: false,
      hardRiskFlags: [],
      softRiskFlags: ["harsh_criticism"],
      matchedRules: ["fixture:actionable-feedback"],
    };
  }

  return {
    candidateLevel: "safe",
    certainty: "clear",
    feedbackPresent: false,
    locationOrScheduleMention: false,
    sensitiveTopicMatched: false,
    hardRiskFlags: [],
    softRiskFlags: [],
    matchedRules: [],
  };
};

const terraOutputFor = (sourceText: string): TerraVerdict => {
  if (threatPattern.test(sourceText)) {
    return {
      verdictLevel: "danger",
      certainty: "clear",
      reasonCodes: ["threat"],
      hardRiskFlags: ["threat"],
      softRiskFlags: [],
      feedbackType: "none",
      feedbackActionable: false,
      feedbackCore: null,
      recommendedActions: [
        "hide_source",
        "preserve_evidence",
        "consider_report",
      ],
      safetyCase: false,
    };
  }

  return {
    verdictLevel: "caution",
    certainty: "clear",
    reasonCodes: [],
    hardRiskFlags: [],
    softRiskFlags: ["harsh_criticism"],
    feedbackType: "actionable",
    feedbackActionable: true,
    feedbackCore: "콘텐츠의 전달 방식을 개선해 달라는 의견",
    recommendedActions: ["show_rewritten_only"],
    safetyCase: false,
  };
};

const createFixtureResponsesClient = (stage: FixtureStage): ResponsesClient => ({
  responses: {
    async parse(request) {
      const sourceText = sourceTextFromRequest(request);
      return {
        id: `fixture-${stage}-response`,
        model: `fixture-${stage}-v1`,
        output_parsed:
          stage === "luna"
            ? lunaOutputFor(sourceText)
            : terraOutputFor(sourceText),
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
        },
      };
    },
  },
});

const fixtureModerationClient: ModerationClient = {
  moderations: {
    async create({ input }) {
      const flagged = threatPattern.test(input);
      const categories: Record<string, boolean> = flagged
        ? { "harassment/threatening": true }
        : {};
      const categoryScores: Record<string, number> = flagged
        ? { "harassment/threatening": 1 }
        : {};
      return {
        results: [
          {
            flagged,
            categories,
            category_scores: categoryScores,
          },
        ],
      };
    },
  },
};

export const createFixtureFirstPass = (): FirstPassRunner =>
  createFirstPassRunner({
    luna: createLunaFirstPass({
      client: createFixtureResponsesClient("luna"),
      model: "fixture-luna-v1",
    }),
    moderation: createModerationScreen({
      client: fixtureModerationClient,
      model: "fixture-moderation-v1",
    }),
  });

export const createFixtureSecondPass = (): TerraVerification =>
  createTerraVerification({
    client: createFixtureResponsesClient("terra"),
    model: "fixture-terra-v1",
  });

export const classificationStageProvider = (
  mode: "live" | "fixture",
): "openai" | "fixture" => (mode === "fixture" ? "fixture" : "openai");
