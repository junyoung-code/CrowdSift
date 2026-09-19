// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { providersFor, recordSemantic } from "./semantic-recording";
import { fixtureSemanticAnalysis } from "../src/features/classification/semantic-fixtures";
import type { SemanticSettings } from "../src/features/classification/semantic-settings";

const mocks = vi.hoisted(() => ({ create: vi.fn(), parse: vi.fn(), anthropicOptions: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: mocks.create }; constructor(options: unknown) { mocks.anthropicOptions(options); } } }));
vi.mock("openai", () => ({ default: class { responses = { parse: mocks.parse }; } }));
const settings: SemanticSettings = { provider: "live", analysisProvider: "anthropic", interpretationProfile: "context-v2", analysis: { model: "claude-sonnet-5", effort: "medium" }, rewrite: { model: "gpt-5.6-luna", effort: "low" }, validation: { model: "gpt-5.6-luna", effort: "medium" } };
const context = { commentId: "test", workspaceId: "test", sourceText: "자막이 작다. 찾아가서 때리겠다", videoTitle: "영상", parent: null, allowedContexts: [], corrections: [] };
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("comparison provider routing", () => {
  it("routes analysis to Claude and CAUTION rewrite/validation to OpenAI through the shared pipeline", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "unit-test-only");
    vi.stubEnv("ANTHROPIC_WORKSPACE_ID", "test-workspace");
    const analysis = fixtureSemanticAnalysis(context.sourceText);
    mocks.create.mockResolvedValue({ id: "claude", model: "claude-sonnet-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(analysis) }], usage: { input_tokens: 10, output_tokens: 20 } });
    mocks.parse.mockResolvedValueOnce({ id: "rewrite", output_parsed: { text: "자막이 작습니다.", preservedClaimIds: analysis.remainingFeedbackClaimIds } });
    mocks.parse.mockResolvedValueOnce({ id: "validation", output_parsed: { harmRemoved: true, claimsPreserved: true, intensityPreserved: true, nothingAdded: true, issues: [] } });
    const providers = providersFor(settings);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.parse).not.toHaveBeenCalled();
    const record = await recordSemantic(context, settings, providers);
    expect(record.error).toBeNull();
    expect(record.result).toMatchObject({ verdict: { level: "caution" }, rewriteStatus: "accepted" });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.parse.mock.calls.map(([request]) => request.model)).toEqual(["gpt-5.6-luna", "gpt-5.6-luna"]);
    expect(mocks.anthropicOptions).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0, defaultHeaders: { "anthropic-workspace-id": "test-workspace" } }));
    expect(JSON.stringify(record)).not.toContain("unit-test-only");
  });
  it("keeps historical OpenAI routing independent of Claude credentials", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const openai = { ...settings, analysis: settings.rewrite }; delete openai.analysisProvider;
    expect(providersFor(openai)).toHaveProperty("analyzer");
    expect(mocks.anthropicOptions).not.toHaveBeenCalled();
  });
  it("fails early for missing keys and misrouted role models", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => providersFor(settings)).toThrow("ANTHROPIC_API_KEY_not_configured");
    vi.stubEnv("ANTHROPIC_API_KEY", "unit-test-only");
    expect(() => providersFor({ ...settings, rewrite: settings.analysis })).toThrow("analysis_only");
    const missingProvider = { ...settings }; delete missingProvider.analysisProvider;
    expect(() => providersFor(missingProvider)).toThrow("requires_analysis_provider");
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.parse).not.toHaveBeenCalled();
  });
});
