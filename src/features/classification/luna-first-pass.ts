import "server-only";

import { zodTextFormat } from "openai/helpers/zod";

import type { FirstPassInput, ModelRun } from "./contracts";
import {
  LUNA_FIRST_PASS_PROMPT,
  LUNA_FIRST_PASS_PROMPT_VERSION,
} from "./prompts";
import { LunaFirstPassSchema, type LunaFirstPass } from "./schemas";

type ParsedResponse = {
  id: string;
  model?: string;
  output_parsed: unknown;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  } | null;
};

export type ResponsesClient = {
  responses: {
    parse(input: Record<string, unknown>): Promise<ParsedResponse>;
  };
};

export class ClassificationSchemaError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ClassificationSchemaError";
  }
}

/**
 * 모델에게 보내는 사용자 메시지. 프롬프트가 참조하는 이름과 정확히 맞춘다.
 */
const toModelInput = (input: FirstPassInput) => ({
  comment: input.sourceText,
  videoTitle: input.videoTitle,
  profile: input.profile,
  similarExamples: input.similarExamples.map((example) => ({
    text: example.text,
    level: example.level,
    note: example.note,
  })),
});

/**
 * 1-B. Luna 1차 분류.
 *
 * 등급 후보와 신호만 낸다. 2차 검증 여부는 여기서 정하지 않는다.
 */
export const createLunaFirstPass = ({
  client,
  model,
}: {
  client: ResponsesClient;
  model: string;
}) => ({
  promptVersion: LUNA_FIRST_PASS_PROMPT_VERSION,

  async classify(
    input: FirstPassInput,
  ): Promise<{ result: LunaFirstPass; run: ModelRun }> {
    const startedAt = Date.now();
    const response = await client.responses.parse({
      model,
      reasoning: { effort: "none" },
      input: [
        { role: "system", content: LUNA_FIRST_PASS_PROMPT },
        { role: "user", content: JSON.stringify(toModelInput(input)) },
      ],
      text: {
        format: zodTextFormat(LunaFirstPassSchema, "luna_first_pass"),
      },
    });

    if (response.output_parsed === null) {
      throw new ClassificationSchemaError("Luna returned no parsed output");
    }

    const parsed = LunaFirstPassSchema.safeParse(response.output_parsed);

    if (!parsed.success) {
      throw new ClassificationSchemaError(
        "Luna output did not match the first pass schema",
        { cause: parsed.error },
      );
    }

    return {
      result: parsed.data,
      run: {
        model: response.model ?? model,
        responseId: response.id,
        latencyMs: Date.now() - startedAt,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
      },
    };
  },
});

export type LunaFirstPassClassifier = ReturnType<typeof createLunaFirstPass>;
