import { describe, expect, it, vi } from "vitest";
import { runSemanticPipeline, semanticPublicTrace, type SemanticAttempt, type SemanticRepository, type SemanticState } from "./semantic-service";
import { createFixtureSemanticProviders } from "./semantic-fixtures";
import { semanticSettingsFromEnv } from "./semantic-settings";

function setup(sourceText = "자막이 작다. 찾아가서 때리겠다") {
  const state: SemanticState = { snapshot: { configurationKey: "test", settings: semanticSettingsFromEnv({ EXTERNAL_PROVIDER_MODE: "fixture" }), context: { commentId: "comment", workspaceId: "workspace", sourceText, parent: null, videoTitle: "", allowedContexts: [], corrections: [] } }, attempts: [], verdict: null, rewriteStatus: "pending" };
  const repository: SemanticRepository = {
    saveAttempt: vi.fn(async (attempt: SemanticAttempt) => { state.attempts.push(attempt); }),
    saveVerdict: vi.fn(async verdict => { state.verdict = verdict; }),
    saveRewrite: vi.fn(async (_rewrite, status) => { state.rewriteStatus = status; }),
  };
  return { state, repository, providers: createFixtureSemanticProviders() };
}
describe("semantic pipeline recovery", () => {
  it("runs independent validation and reuses every successful stage after restart", async () => {
    const { state, repository, providers } = setup();
    const first = await runSemanticPipeline(state, providers, repository);
    expect(first.rewriteStatus).toBe("accepted");
    expect(state.attempts.map(a => a.stage)).toEqual(["semantic_analysis", "feedback_rewrite", "rewrite_validation"]);
    providers.analyzer.analyze = vi.fn(() => { throw new Error("must not call"); });
    providers.rewriter.rewrite = vi.fn(() => { throw new Error("must not call"); });
    providers.validator.validate = vi.fn(() => { throw new Error("must not call"); });
    expect((await runSemanticPipeline(state, providers, repository)).rewrite).toEqual(first.rewrite);
  });
  it("retries rejected rewrite once then preserves CAUTION without showing a fallback", async () => {
    const { state, repository, providers } = setup();
    const original = providers.validator.validate;
    providers.validator.validate = vi.fn(async input => {
      const result = await original(input); result.result.intensityPreserved = false; result.result.issues = ["시청 이탈 정보 누락"]; return result;
    });
    const result = await runSemanticPipeline(state, providers, repository);
    expect(providers.validator.validate).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ verdict: { level: "caution" }, rewrite: null, rewriteStatus: "failed" });
    await runSemanticPipeline(state, providers, repository);
    expect(providers.validator.validate).toHaveBeenCalledTimes(2);
  });
  it("resumes validation failure without paying for generation again", async () => {
    const { state, repository, providers } = setup();
    const original = providers.validator.validate;
    providers.validator.validate = vi.fn(async () => { throw new Error("network"); });
    await expect(runSemanticPipeline(state, providers, repository)).rejects.toThrow("network");
    expect(state.verdict?.level).toBe("caution");
    expect(state.attempts.at(-1)?.status).toBe("failed");
    providers.validator.validate = original;
    providers.rewriter.rewrite = vi.fn(() => { throw new Error("must reuse"); });
    expect((await runSemanticPipeline(state, providers, repository)).rewriteStatus).toBe("accepted");
  });
  it("does not turn output errors into a HOLD verdict", async () => {
    const { state, repository, providers } = setup();
    const original = providers.analyzer.analyze;
    providers.analyzer.analyze = async context => { const output = await original(context); output.result.remainingFeedbackClaimIds = ["invented"]; return output; };
    await expect(runSemanticPipeline(state, providers, repository)).rejects.toThrow("invalid_remaining");
    expect(repository.saveVerdict).not.toHaveBeenCalled();
  });
  it("does not leak attack excerpts or unvalidated claims in the public trace", async () => {
    const { state, repository, providers } = setup();
    const result = await runSemanticPipeline(state, providers, repository);
    const trace = JSON.stringify(semanticPublicTrace(result.analysis, result.verdict, result.rewriteStatus));
    expect(trace).not.toContain("때리겠다"); expect(trace).not.toContain("evidence"); expect(trace).not.toContain("coreMeaning");
  });
});
