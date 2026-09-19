import { describe, expect, it } from "vitest";
import { digest, type SemanticCase } from "../src/evaluation/semantic-evaluation";
import { semanticConfigurationKey, semanticSettingsFromEnv } from "../src/features/classification/semantic-settings";
import { createFixtureSemanticProviders } from "../src/features/classification/semantic-fixtures";
import { recordSemantic } from "./semantic-recording";
import { comparisonSummary, validateComparisonBaseline, validateComparisonResume } from "./semantic-comparison-context";
import { buildComparisonDocument, type ComparisonReport } from "./semantic-comparison-report";

async function sample() {
  const settings = semanticSettingsFromEnv({ EXTERNAL_PROVIDER_MODE: "fixture" });
  const cases: SemanticCase[] = [{ id: "c", group: "c", split: "development", sourceText: "자막이 작다", videoTitle: "v", parentText: null, expected: "risk", review: null, tags: [], goldAnalysis: null }];
  const record = await recordSemantic({ commentId: "c", workspaceId: "test", sourceText: cases[0].sourceText, videoTitle: "v", parent: null, allowedContexts: [], corrections: [] }, settings, createFixtureSemanticProviders());
  const report: ComparisonReport = { schemaVersion: "semantic-human-comparison-v1", datasetDigest: digest(cases), settings, startedAt: "2026-09-18T00:00:00Z", finishedAt: "2026-09-18T00:00:01Z", records: { c: record } };
  return { cases, report, settings };
}
describe("comparison provenance", () => {
  it("re-scores identical outputs on both label sets without changing the original", async () => {
    const { cases, report } = await sample();
    const revised = [{ ...cases[0], expected: "safe" as const }];
    const current = { ...report, datasetDigest: digest(revised) };
    const summary = comparisonSummary(revised, current, { baseline: report, originalCases: cases });
    expect(summary.baselineOnOriginalLabels?.agreement).toBe(0);
    expect(summary.baselineOnRevisedLabels?.agreement).toBe(1);
    expect(summary.current.agreement).toBe(1);
    expect(cases[0].expected).toBe("risk");
    expect(summary.usage.estimatedUSD).toBeNull();
    const doc = new DOMParser().parseFromString(buildComparisonDocument(revised, current, { baseline: report, originalCases: cases }), "text/html");
    expect(doc.body.textContent).toContain("이전 AI · 안전");
    expect(doc.body.textContent).toContain("실제 공격 대상");
    expect(doc.body.textContent).toContain("동일한 수정 후 평가 기준");
    expect(doc.querySelectorAll("details.source[open]")).toHaveLength(0);
  });
  it("rejects different comments or missing provenance", async () => {
    const { cases, report } = await sample();
    expect(() => validateComparisonBaseline([{ ...cases[0], parentText: "different" }], { baseline: report, originalCases: cases })).toThrow("context_mismatch");
    expect(() => validateComparisonBaseline(cases, { baseline: report })).toThrow("required");
  });
  it("checks even completed records before skipping them on resume", async () => {
    const { cases, report, settings } = await sample();
    expect(() => validateComparisonResume(report, cases, settings, {})).not.toThrow();
    const v2 = { ...settings, interpretationProfile: "context-v2" as const };
    expect(() => validateComparisonResume(report, cases, v2, {})).toThrow("mismatch");
    const forged = { ...report, settings: v2, configurationKey: semanticConfigurationKey(v2, 1) };
    expect(() => validateComparisonResume(forged, cases, v2, {})).toThrow("record configuration");
    report.configurationKey = "stale-prompt-version";
    expect(() => validateComparisonResume(report, cases, settings, {})).toThrow("mismatch");
  });
});
