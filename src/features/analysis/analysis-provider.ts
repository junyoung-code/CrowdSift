import type {
  DashboardSummaryOutput,
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
  embed(text: string): Promise<{ vector: number[]; model: string }>;
  summarizeDashboard(input: {
    analysisCount: number;
    distribution: Record<ReviewLevel, number>;
    sanitizedSignals: string[];
  }): Promise<ModelResult<DashboardSummaryOutput>>;
}
