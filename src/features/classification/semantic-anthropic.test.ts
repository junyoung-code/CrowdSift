import { describe, expect, it, vi } from "vitest";
import { createAnthropicSemanticAnalyzer } from "./semantic-anthropic";
import { SemanticOutputError } from "./semantic-contracts";
import { fixtureSemanticAnalysis } from "./semantic-fixtures";
import { semanticConfigurationKey, type SemanticSettings } from "./semantic-settings";
import { semanticPromptsFor } from "./semantic-prompts";
import { createOpenAISemanticProviders } from "./semantic-openai";
import { recordSemantic, offlineProviders } from "../../../scripts/semantic-recording";

const settings: SemanticSettings = { provider: "live", analysisProvider: "anthropic", interpretationProfile: "context-v2", analysis: { model: "claude-sonnet-5", effort: "medium" }, rewrite: { model: "gpt-5.6-luna", effort: "low" }, validation: { model: "gpt-5.6-luna", effort: "medium" } };
const context = { commentId: "test", workspaceId: "test", sourceText: "자막이 작다", videoTitle: "영상", parent: { id: "p", text: "부모 댓글" }, allowedContexts: [], corrections: [] };
const analysis = fixtureSemanticAnalysis(context.sourceText);
const response = { id: "msg_test", model: "claude-sonnet-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(analysis) }], usage: { input_tokens: 30, output_tokens: 10 } };

describe("Anthropic semantic analysis adapter", () => {
  it("keeps the same context/prompts and contract, records usage, and ignores thinking blocks", async () => {
    const create = vi.fn().mockResolvedValue({ ...response, content: [{ type: "thinking", thinking: "private" }, ...response.content] });
    const result = await createAnthropicSemanticAnalyzer({ messages: { create } }, settings).analyze(context);
    expect(result.result).toEqual(analysis);
    expect(result.run).toMatchObject({ model: response.model, responseId: "msg_test", usage: { inputTokens: 30, outputTokens: 10, totalTokens: 40 } });
    const request = create.mock.calls[0][0];
    expect(request.system).toBe(semanticPromptsFor("context-v2").analysis);
    expect(JSON.parse(request.messages[0].content)).toEqual({ comment: context.sourceText, videoTitle: context.videoTitle, parent: context.parent, allowedContexts: [], corrections: [] });
    expect(request).toMatchObject({ max_tokens: 4096, thinking: { type: "adaptive" }, output_config: { effort: "medium", format: { type: "json_schema" } } });
    expect(request.output_config.format.schema.properties).not.toHaveProperty("level");
    expect(create).toHaveBeenCalledTimes(1);
  });
  it.each(["refusal", "max_tokens", "pause_turn", null])("rejects stop reason %s while retaining billed usage", async stop_reason => {
    const create = vi.fn().mockResolvedValue({ ...response, stop_reason });
    await expect(createAnthropicSemanticAnalyzer({ messages: { create } }, settings).analyze(context)).rejects.toMatchObject({ name: "SemanticOutputError", modelOutput: { run: { usage: { totalTokens: 40 } } } });
  });
  it.each(["", "not json", '{"level":"safe"}', JSON.stringify({ ...analysis, confidence: 2 })])("rejects missing, malformed or invalid JSON: %s", async text => {
    const create = vi.fn().mockResolvedValue({ ...response, content: [{ type: "text", text }] });
    await expect(createAnthropicSemanticAnalyzer({ messages: { create } }, settings).analyze(context)).rejects.toBeInstanceOf(SemanticOutputError);
  });
  it("records evidence failure as analysis failure, never HOLD", async () => {
    const invalid = { ...analysis, feedbackClaims: [{ id: "f", kind: "preference", content: "없는 내용", evidence: ["원문에 없음"] }], remainingFeedbackClaimIds: ["f"] };
    const create = vi.fn().mockResolvedValue({ ...response, content: [{ type: "text", text: JSON.stringify(invalid) }] });
    const record = await recordSemantic(context, settings, { ...offlineProviders, analyzer: createAnthropicSemanticAnalyzer({ messages: { create } }, settings) });
    expect(record.error).toContain("evidence_not_in_source");
    expect(record.result).toBeNull();
    expect(record.state.verdict).toBeNull();
    expect(record.state.attempts[0]).toMatchObject({ stage: "semantic_analysis", status: "failed", run: { usage: { totalTokens: 40 } } });
  });
  it("propagates API failure without inventing a grade", async () => {
    const create = vi.fn().mockRejectedValue(new Error("authentication_failed"));
    await expect(createAnthropicSemanticAnalyzer({ messages: { create } }, settings).analyze(context)).rejects.toThrow("authentication_failed");
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("rejects unsupported effort/model before making requests", () => {
    const client = { messages: { create: vi.fn() } };
    for (const effort of ["none", "minimal", "xhigh"] as const) expect(() => createAnthropicSemanticAnalyzer(client, { ...settings, analysis: { ...settings.analysis, effort } })).toThrow("effort");
    expect(() => createAnthropicSemanticAnalyzer(client, { ...settings, analysis: settings.rewrite })).toThrow("sonnet");
    expect(client.messages.create).not.toHaveBeenCalled();
  });
  it("isolates saved configurations and prevents use through the operational OpenAI factory", () => {
    const openai = { ...settings }; delete openai.analysisProvider;
    expect(semanticConfigurationKey(settings, 1)).not.toBe(semanticConfigurationKey(openai, 1));
    expect(() => createOpenAISemanticProviders({ responses: { parse: vi.fn() } }, settings)).toThrow("comparison_provider");
  });
});
