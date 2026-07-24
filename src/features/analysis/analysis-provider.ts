import "server-only";

import { getServerEnv } from "@/lib/env";

import { FixtureAnalysisProvider } from "./fixture-analysis-provider";
import { createOpenAIAnalysisProvider } from "./openai-analysis-provider";
import type {
  DashboardSummaryOutput,
  EmbeddingResult,
  ModelResult,
  ReviewLevel,
  Stage1Input,
  Stage1Output,
  Stage2Input,
  Stage2Output,
} from "./contracts";

export interface AnalysisProvider {
  classifyStage1(
    input: Stage1Input,
  ): Promise<ModelResult<Stage1Output>>;
  classifyStage2(
    input: Stage2Input,
  ): Promise<ModelResult<Stage2Output>>;
  embed(text: string): Promise<EmbeddingResult>;
  summarizeDashboard(input: {
    analysisCount: number;
    distribution: Record<ReviewLevel, number>;
    sanitizedSignals: string[];
  }): Promise<ModelResult<DashboardSummaryOutput>>;
}

type AnalysisProviderFactoryConfiguration = {
  externalProviderMode: "live" | "fixture";
  nodeEnv: string | undefined;
  allowFixtureProviders: boolean;
  openAI: {
    stageOneModel: string;
    stageTwoModel: string;
    embeddingModel: string;
  };
};

export const createAnalysisProviderFactory = (
  configuration: AnalysisProviderFactoryConfiguration,
): AnalysisProvider => {
  if (configuration.externalProviderMode === "fixture") {
    if (configuration.nodeEnv === "production") {
      throw new Error("Fixture providers are test-only");
    }
    if (!configuration.allowFixtureProviders) {
      throw new Error("Fixture providers are disabled");
    }

    return new FixtureAnalysisProvider();
  }

  return createOpenAIAnalysisProvider({
    stageOneModel: configuration.openAI.stageOneModel,
    stageTwoModel: configuration.openAI.stageTwoModel,
    embeddingModel: configuration.openAI.embeddingModel,
  });
};

export const createAnalysisProvider = (): AnalysisProvider => {
  const environment = getServerEnv();

  return createAnalysisProviderFactory({
    externalProviderMode: environment.EXTERNAL_PROVIDER_MODE,
    nodeEnv: process.env.NODE_ENV,
    allowFixtureProviders: environment.ALLOW_FIXTURE_PROVIDERS,
    openAI: {
      stageOneModel:
        environment.OPENAI_STAGE1_MODEL ??
        environment.OPENAI_ANALYSIS_MODEL,
      stageTwoModel:
        environment.OPENAI_STAGE2_MODEL ??
        environment.OPENAI_ANALYSIS_MODEL,
      embeddingModel: environment.OPENAI_EMBEDDING_MODEL,
    },
  });
};
