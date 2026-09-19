import { describe, expect, it, vi } from "vitest";
import { SemanticAnalysisV1Schema, SemanticAnalysisV2Schema, validateSemanticAnalysis, type SemanticAnalysis } from "./semantic-contracts";
import { fixtureSemanticAnalysis } from "./semantic-fixtures";
import { createOpenAISemanticProviders } from "./semantic-openai";
import { classifySemanticAnalysis } from "./semantic-policy";
import { semanticConfigurationKey, semanticSettingsFromEnv } from "./semantic-settings";
import { semanticPromptsFor } from "./semantic-prompts";
import { offlineProviders, recordSemantic } from "../../../scripts/semantic-recording";

const context = { commentId: "c", workspaceId: "test", sourceText: "사람들 피곤하게 사네. 언니 이뻐요", videoTitle: "먹방", parent: { id: "p", text: "살이 빠졌네요" }, allowedContexts: [], corrections: [] };
const settings = { ...semanticSettingsFromEnv({ EXTERNAL_PROVIDER_MODE: "fixture" }), interpretationProfile: "context-v3" as const };
export function detailedAnalysis(): SemanticAnalysis {
  return { ...fixtureSemanticAnalysis("좋아요"), interpretation: {
    addressees: [{ target: "viewers", evidence: [{ source: "comment", quote: "사람들" }] }],
    speechActs: [{ type: "defense", evidence: [{ source: "comment", quote: "언니 이뻐요" }] }],
    literalMeaning: "시청자를 비판하며 크리에이터를 칭찬한다.",
    impliedMeaning: { text: "크리에이터를 옹호한다.", evidence: [{ source: "parent", quote: "살이 빠졌네요" }] },
    missingContext: [],
  } };
}
describe("context-v3 interpretation contract", () => {
  it("keeps old records unchanged and requires details only for new runs", () => {
    const old = fixtureSemanticAnalysis("좋아요");
    expect(validateSemanticAnalysis(old, "좋아요")).toEqual(old);
    expect(() => validateSemanticAnalysis(old, "좋아요", "context-v3")).toThrow();
    expect(SemanticAnalysisV1Schema.safeParse(detailedAnalysis()).success).toBe(false);
    expect(SemanticAnalysisV2Schema.safeParse(detailedAnalysis()).success).toBe(true);
  });
  it("checks the specific evidence source including title and parent", () => {
    const a = detailedAnalysis();
    a.interpretation!.speechActs[0].evidence.push({ source: "title", quote: "먹방" });
    expect(validateSemanticAnalysis(a, context, "context-v3")).toEqual(a);
    a.interpretation!.impliedMeaning!.evidence[0].source = "comment";
    expect(() => validateSemanticAnalysis(a, context, "context-v3")).toThrow("interpretation_evidence_not_in_source");
  });
  it("rejects invented evidence, empty non-unknown addressee evidence and missing parents", () => {
    const a = detailedAnalysis();
    a.interpretation!.addressees[0].evidence[0].quote = "없는 원문";
    expect(() => validateSemanticAnalysis(a, context, "context-v3")).toThrow("evidence_not_in_source");
    const b = detailedAnalysis(); b.interpretation!.addressees[0].evidence = [];
    expect(() => validateSemanticAnalysis(b, context, "context-v3")).toThrow("addressee_evidence_missing");
    b.interpretation!.addressees[0] = { target: "parent_author", evidence: [{ source: "comment", quote: "사람들" }] }; b.interpretation!.impliedMeaning = null;
    expect(() => validateSemanticAnalysis(b, { ...context, parent: null }, "context-v3")).toThrow("parent_addressee_without_parent");
  });
  it("does not promote speech acts, unknown addressees, low confidence or missing context into harm or HOLD", () => {
    const a = detailedAnalysis(); a.confidence = .1;
    a.interpretation!.addressees = [{ target: "unknown", evidence: [] }];
    a.interpretation!.speechActs[0].type = "mockery";
    a.interpretation!.missingContext = ["영상에서 지칭한 음식이 무엇인지 알 수 없다."];
    expect(classifySemanticAnalysis(validateSemanticAnalysis(a, context, "context-v3")).level).toBe("safe");
  });
  it("requires the missing information and reason for unrecoverable meaning", () => {
    const a = detailedAnalysis(); a.meaningClear = false; a.uninterpretableReason = "축약 표현의 뜻을 복원할 수 없습니다.";
    expect(() => validateSemanticAnalysis(a, context, "context-v3")).toThrow("hold_missing_context_required");
    a.interpretation!.missingContext = ["축약 표현의 뜻"];
    expect(classifySemanticAnalysis(validateSemanticAnalysis(a, context, "context-v3")).level).toBe("hold");
    a.uninterpretableReason = null;
    expect(() => validateSemanticAnalysis(a, context, "context-v3")).toThrow("meaning_reason_inconsistent");
  });
  it("uses one analysis call and the v3 schema, while preserving policy and other prompts", async () => {
    const a = detailedAnalysis();
    const parse = vi.fn().mockResolvedValue({ id: "run", model: "fixture", output_parsed: a, usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } });
    const providers = createOpenAISemanticProviders({ responses: { parse } }, settings);
    const record = await recordSemantic(context, settings, providers);
    expect(record.error).toBeNull(); expect(parse).toHaveBeenCalledTimes(1);
    expect(parse.mock.calls[0][0].text.format.schema.required).toContain("interpretation");
    expect(parse.mock.calls[0][0].text.format.schema.properties).not.toHaveProperty("level");
    const v2 = semanticPromptsFor("context-v2"), v3 = semanticPromptsFor("context-v3");
    expect(v3.analysis).toContain(v2.analysis);
    expect(v3.rewrite).toBe(v2.rewrite); expect(v3.validation).toBe(v2.validation);
    expect(semanticConfigurationKey(settings, 1)).not.toBe(semanticConfigurationKey({ ...settings, interpretationProfile: "context-v2" }, 1));
    const replay = await recordSemantic(context, settings, offlineProviders, record);
    expect(replay.result?.analysis.interpretation).toEqual(a.interpretation);
    await expect(recordSemantic(context, { ...settings, interpretationProfile: "context-v2" }, offlineProviders, record)).rejects.toThrow("configuration_mismatch");
  });
  it("records malformed v3 output as failure rather than HOLD", async () => {
    const parse = vi.fn().mockResolvedValue({ id: "bad", output_parsed: fixtureSemanticAnalysis("좋아요") });
    const record = await recordSemantic(context, settings, createOpenAISemanticProviders({ responses: { parse } }, settings));
    expect(record.error).not.toBeNull(); expect(record.result).toBeNull(); expect(record.state.verdict).toBeNull();
    expect(record.state.attempts[0]).toMatchObject({ status: "failed", stage: "semantic_analysis" });
  });
});
