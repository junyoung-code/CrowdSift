import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
export type ResponsesClient = {
  responses: { parse(input: Record<string, unknown>): Promise<{
    id: string; model?: string; output_parsed: unknown;
    usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null;
  }> };
};
import { semanticAnalysisSchemaFor, FeedbackRewriteSchema, RewriteValidationSchema, SemanticOutputError, type ModelOutput, type SemanticProviders } from "./semantic-contracts";
import type { SemanticSettings } from "./semantic-settings";
import { semanticPromptsFor } from "./semantic-prompts";

export function createOpenAISemanticProviders(client: ResponsesClient, settings: SemanticSettings): SemanticProviders {
  if (settings.analysisProvider === "anthropic") throw new Error("anthropic_analysis_requires_comparison_provider");
  const prompts = semanticPromptsFor(settings.interpretationProfile);
  for (const role of [settings.analysis, settings.rewrite, settings.validation]) {
    if (role.model === "unconfigured") throw new Error("semantic_models_not_configured");
  }
  async function parse<T>(role: SemanticSettings["analysis"], prompt: string, input: unknown, schema: z.ZodType<T>, name: string): Promise<ModelOutput<T>> {
    const started = Date.now();
    const response = await client.responses.parse({
      model: role.model,
      ...(role.effort ? { reasoning: { effort: role.effort } } : {}),
      input: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify(input) }],
      text: { format: zodTextFormat(schema, name) },
    });
    const run = {
      model: response.model ?? role.model, responseId: response.id, latencyMs: Date.now() - started,
      usage: { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0, totalTokens: response.usage?.total_tokens ?? 0 },
    };
    const parsed = schema.safeParse(response.output_parsed);
    if (!parsed.success) throw new SemanticOutputError(response.output_parsed ? "semantic_output_invalid" : "semantic_output_missing", { run, output: response.output_parsed });
    return { result: parsed.data, run };
  }
  return {
    analyzer: { analyze: context => parse(settings.analysis, prompts.analysis, { comment: context.sourceText, videoTitle: context.videoTitle, parent: context.parent, allowedContexts: context.allowedContexts, corrections: context.corrections }, semanticAnalysisSchemaFor(settings.interpretationProfile), "semantic_analysis") },
    rewriter: { rewrite: input => parse(settings.rewrite, prompts.rewrite, input, FeedbackRewriteSchema, "feedback_rewrite") },
    validator: { validate: input => parse(settings.validation, prompts.validation, input, RewriteValidationSchema, "rewrite_validation") },
  };
}
