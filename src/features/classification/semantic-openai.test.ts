import { describe, expect, it, vi } from "vitest";
import { createOpenAISemanticProviders } from "./semantic-openai";
import { fixtureSemanticAnalysis } from "./semantic-fixtures";
import { semanticSettingsFromEnv } from "./semantic-settings";
import { semanticPromptsFor } from "./semantic-prompts";

const settings = semanticSettingsFromEnv({ OPENAI_SEMANTIC_MODEL: "analysis-model", OPENAI_SEMANTIC_REASONING_EFFORT: "high", OPENAI_FEEDBACK_REWRITE_MODEL: "rewrite-model", OPENAI_REWRITE_VALIDATION_MODEL: "validator-model" });
const context = { commentId: "c", workspaceId: "w", sourceText: "자막이 작다", videoTitle: "video", parent: null, allowedContexts: [], corrections: [] };
describe("semantic OpenAI adapter", () => {
  it("routes all roles through the selected profile without adding calls", async () => {
    const analysis = fixtureSemanticAnalysis(context.sourceText);
    const rewrite = { text: "자막이 작다", preservedClaimIds: ["claim-1"] };
    const parse = vi.fn().mockResolvedValueOnce({ id: "a", output_parsed: analysis }).mockResolvedValueOnce({ id: "r", output_parsed: rewrite }).mockResolvedValueOnce({ id: "v", output_parsed: { harmRemoved: true, claimsPreserved: true, intensityPreserved: true, nothingAdded: true, issues: [] } });
    const providers = createOpenAISemanticProviders({ responses: { parse } }, { ...settings, interpretationProfile: "context-v2" });
    await providers.analyzer.analyze(context);
    await providers.rewriter.rewrite({ claims: analysis.feedbackClaims, previousIssues: [] });
    await providers.validator.validate({ source: context.sourceText, analysis, rewrite });
    const prompts = semanticPromptsFor("context-v2");
    expect(parse.mock.calls.map(c => c[0].input[0].content)).toEqual([prompts.analysis, prompts.rewrite, prompts.validation]);
    expect(parse).toHaveBeenCalledTimes(3);
  });
  it("requires explicit role models before any API request", () => {
    expect(() => createOpenAISemanticProviders({ responses: { parse: vi.fn() } }, semanticSettingsFromEnv({}))).toThrow("semantic_models_not_configured");
  });
  it("uses separate role calls and records usage without requesting a grade", async () => {
    const analysis = fixtureSemanticAnalysis(context.sourceText);
    const parse = vi.fn().mockResolvedValueOnce({ id: "a", output_parsed: analysis, usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 } }).mockResolvedValueOnce({ id: "r", output_parsed: { text: "자막이 작다", preservedClaimIds: ["f1"] } }).mockResolvedValueOnce({ id: "v", output_parsed: { harmRemoved: true, claimsPreserved: true, intensityPreserved: true, nothingAdded: true, issues: [] } });
    const providers = createOpenAISemanticProviders({ responses: { parse } }, settings);
    const result = await providers.analyzer.analyze(context);
    expect(result.run.usage.totalTokens).toBe(16);
    const rewrite = await providers.rewriter.rewrite({ claims: analysis.feedbackClaims, previousIssues: [] });
    await providers.validator.validate({ source: context.sourceText, analysis, rewrite: rewrite.result });
    expect(parse.mock.calls.map(c => c[0].model)).toEqual(["analysis-model", "rewrite-model", "validator-model"]);
    expect(parse.mock.calls[0][0].reasoning).toEqual({ effort: "high" });
    expect(parse.mock.calls[0][0].text.format.schema.properties).not.toHaveProperty("level");
  });
  it.each([null, { level: "safe" }])("rejects refusal/malformed output rather than HOLD", async output_parsed => {
    const providers = createOpenAISemanticProviders({ responses: { parse: vi.fn().mockResolvedValue({ id: "bad", output_parsed }) } }, settings);
    await expect(providers.analyzer.analyze(context)).rejects.toThrow();
  });
});
