import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

import { getServerEnv } from "@/lib/env";

import type {
  DashboardSummaryOutput,
  ModelResult,
  Stage1Input,
  Stage1Output,
  Stage2Input,
  Stage2Output,
} from "./contracts";
import {
  DASHBOARD_SUMMARY_SYSTEM_PROMPT,
  STAGE_1_SYSTEM_PROMPT,
  STAGE_2_SYSTEM_PROMPT,
} from "./prompts";
import {
  DashboardSummaryOutputSchema,
  Stage1OutputSchema,
  Stage2OutputSchema,
} from "./schemas";
import { AnalysisSchemaError } from "./analysis-errors";

export { AnalysisSchemaError } from "./analysis-errors";

type ParsedResponse = {
  id: string;
  model?: string;
  output_parsed: unknown;
  usage:
    | {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
      }
    | null;
};

type EmbeddingResponse = {
  data: Array<{ embedding: number[] }>;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
};

export type OpenAIAnalysisClient = {
  responses: {
    parse(input: Record<string, unknown>): Promise<ParsedResponse>;
  };
  embeddings: {
    create(input: Record<string, unknown>): Promise<EmbeddingResponse>;
  };
};

const toUsageRecord = (usage: ParsedResponse["usage"]) => ({
  inputTokens: usage?.input_tokens ?? 0,
  outputTokens: usage?.output_tokens ?? 0,
  totalTokens: usage?.total_tokens ?? 0,
});

const parseOutput = <T>(schema: z.ZodType<T>, value: unknown): T => {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new AnalysisSchemaError("Structured output did not match schema", {
      cause: error,
    });
  }
};

export const createOpenAIAnalysisProvider = (options?: {
  client?: OpenAIAnalysisClient;
  stageOneModel?: string;
  stageTwoModel?: string;
  embeddingModel?: string;
}) => {
  const environment =
    options?.client &&
    options.stageOneModel &&
    options.stageTwoModel &&
    options.embeddingModel
      ? null
      : getServerEnv();
  const stageOneModel =
    options?.stageOneModel ??
    environment?.OPENAI_STAGE1_MODEL ??
    environment?.OPENAI_ANALYSIS_MODEL;
  const stageTwoModel =
    options?.stageTwoModel ??
    environment?.OPENAI_STAGE2_MODEL ??
    environment?.OPENAI_ANALYSIS_MODEL;
  const embeddingModel =
    options?.embeddingModel ?? environment?.OPENAI_EMBEDDING_MODEL;
  const client =
    options?.client ??
    (new OpenAI({
      apiKey: environment?.OPENAI_API_KEY,
    }) as unknown as OpenAIAnalysisClient);

  if (!stageOneModel || !stageTwoModel || !embeddingModel) {
    throw new Error("OpenAI model configuration is required");
  }

  const runStructured = async <T>({
    input,
    name,
    model,
    prompt,
    schema,
  }: {
    input: unknown;
    name: string;
    model: string;
    prompt: string;
    schema: z.ZodType<T>;
  }): Promise<ModelResult<T>> => {
    const startedAt = Date.now();
    const response = await client.responses.parse({
      model,
      input: [
        { role: "system", content: prompt },
        { role: "user", content: JSON.stringify(input) },
      ],
      text: {
        format: zodTextFormat(schema, name),
      },
    });

    if (response.output_parsed === null) {
      throw new AnalysisSchemaError(`Missing parsed output for ${name}`);
    }

    return {
      output: parseOutput(schema, response.output_parsed),
      provider: "openai",
      modelIdentifier: response.model ?? model,
      providerResponseId: response.id,
      latencyMs: Date.now() - startedAt,
      usage: toUsageRecord(response.usage),
    };
  };

  return {
    classifyStage1(input: Stage1Input) {
      return runStructured<Stage1Output>({
        input,
        name: "comment_stage_1",
        model: stageOneModel,
        prompt: STAGE_1_SYSTEM_PROMPT,
        schema: Stage1OutputSchema,
      });
    },
    classifyStage2(input: Stage2Input) {
      return runStructured<Stage2Output>({
        input,
        name: "comment_stage_2",
        model: stageTwoModel,
        prompt: STAGE_2_SYSTEM_PROMPT,
        schema: Stage2OutputSchema,
      });
    },
    async embed(text: string) {
      const response = await client.embeddings.create({
        model: embeddingModel,
        input: text,
        encoding_format: "float",
      });
      const vector = response.data[0]?.embedding;

      if (!vector) {
        throw new Error("OpenAI embedding response was empty");
      }

      return {
        vector,
        model: embeddingModel,
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
      };
    },
    summarizeDashboard(input: {
      analysisCount: number;
      distribution: Record<"safe" | "caution" | "risk", number>;
      sanitizedSignals: string[];
    }) {
      return runStructured<DashboardSummaryOutput>({
        input,
        name: "dashboard_summary",
        model: stageTwoModel,
        prompt: DASHBOARD_SUMMARY_SYSTEM_PROMPT,
        schema: DashboardSummaryOutputSchema,
      });
    },
  };
};
