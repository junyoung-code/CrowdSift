import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SemanticAnalysisV1Schema as SemanticAnalysisSchema, SemanticOutputError, type SemanticAnalyzer } from "./semantic-contracts";
import { semanticPromptsFor } from "./semantic-prompts";
import type { SemanticSettings } from "./semantic-settings";

export type AnthropicMessagesClient = {
  messages: { create(input: MessageCreateParamsNonStreaming): Promise<{
    id: string; model: string; stop_reason: string | null;
    content: Array<{ type: string; text?: string }>;
    usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
  }> };
};

/** Test adapter: same semantic contract and prompts; grades still come from policy. */
export function createAnthropicSemanticAnalyzer(client: AnthropicMessagesClient, settings: SemanticSettings): SemanticAnalyzer {
  if (settings.interpretationProfile === "context-v3") throw new Error("context_v3_luna_comparison_only");
  const { model, effort } = settings.analysis;
  if (!model.startsWith("claude-sonnet-")) throw new Error("anthropic_test_requires_sonnet_model");
  if (effort !== null && effort !== "low" && effort !== "medium" && effort !== "high") {
    throw new Error("anthropic_test_effort_must_be_low_medium_high");
  }
  const prompt = semanticPromptsFor(settings.interpretationProfile).analysis;
  return {
    async analyze(context) {
      const start = Date.now();
      // Use create + local parsing so failed outputs still retain billed usage.
      const response = await client.messages.create({
        model, max_tokens: 4096, thinking: { type: "adaptive" },
        system: prompt,
        messages: [{ role: "user", content: JSON.stringify({ comment: context.sourceText, videoTitle: context.videoTitle, parent: context.parent, allowedContexts: context.allowedContexts, corrections: context.corrections }) }],
        output_config: { format: zodOutputFormat(SemanticAnalysisSchema), ...(effort ? { effort } : {}) },
      });
      const inputTokens = response.usage.input_tokens + (response.usage.cache_creation_input_tokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0);
      const run = {
        model: response.model, responseId: response.id, latencyMs: Date.now() - start,
        usage: { inputTokens, outputTokens: response.usage.output_tokens, totalTokens: inputTokens + response.usage.output_tokens },
      };
      const raw = response.content.filter(block => block.type === "text").map(block => block.text ?? "").join("");
      if (response.stop_reason !== "end_turn") {
        throw new SemanticOutputError(`anthropic_stop_${response.stop_reason ?? "unknown"}`, { run, output: raw });
      }
      let output: unknown;
      try { output = JSON.parse(raw); }
      catch { throw new SemanticOutputError("semantic_output_invalid_json", { run, output: raw }); }
      const parsed = SemanticAnalysisSchema.safeParse(output);
      if (!parsed.success) throw new SemanticOutputError("semantic_output_invalid", { run, output });
      return { result: parsed.data, run };
    },
  };
}
