import { describe, expect, it } from "vitest";
import { digest, type SemanticCase } from "../src/evaluation/semantic-evaluation";
import { semanticSettingsFromEnv } from "../src/features/classification/semantic-settings";
import { createFixtureSemanticProviders } from "../src/features/classification/semantic-fixtures";
import { recordSemantic } from "./semantic-recording";
import { buildComparisonDocument, comparisonStats, type ComparisonReport } from "./semantic-comparison-report";

async function sample() {
  const cases: SemanticCase[] = ["safe", "risk", "safe", null].map((expected, i) => ({ id: String(i), group: String(i), split: "development", sourceText: "좋아요 <img src=x onerror=alert(1)>", videoTitle: "영상", parentText: null, expected: expected as SemanticCase["expected"], review: null, tags: [], goldAnalysis: null }));
  const settings = semanticSettingsFromEnv({ EXTERNAL_PROVIDER_MODE: "fixture" });
  const report: ComparisonReport = { schemaVersion: "semantic-human-comparison-v1", datasetDigest: digest(cases), settings, startedAt: "2026-09-18T00:00:00Z", finishedAt: null, records: {} };
  for (const c of cases) report.records[c.id] = await recordSemantic({ commentId: c.id, workspaceId: "test", sourceText: c.sourceText, videoTitle: c.videoTitle, parent: null, allowedContexts: [], corrections: [] }, settings, createFixtureSemanticProviders());
  report.records["2"].result = null;
  report.records["2"].error = "API failure";
  return { cases, report };
}
describe("human comparison report", () => {
  it("excludes unrated comments, includes failures, and separates pending from disagreement", async () => {
    const { cases, report } = await sample();
    expect(comparisonStats(cases, report)).toMatchObject({ rated: 3, unrated: 1, compared: 3, matched: 1, mismatched: 1, errors: 1, agreement: 1 / 3 });
    delete report.records["2"];
    expect(comparisonStats(cases, report)).toMatchObject({ compared: 2, matched: 1, mismatched: 1, errors: 0, agreement: 0.5 });
    expect(() => comparisonStats(cases.slice(1), report)).toThrow("dataset mismatch");
  });
  it("escapes comment HTML, keeps source collapsed, and filters disagreements", async () => {
    const { cases, report } = await sample();
    const doc = new DOMParser().parseFromString(buildComparisonDocument(cases, report), "text/html");
    new Function("document", doc.querySelector("script")!.textContent)(doc);
    expect(doc.querySelector("img")).toBeNull();
    expect(doc.querySelectorAll("details.source[open]")).toHaveLength(0);
    expect(doc.querySelectorAll(".human")).toHaveLength(4);
    (doc.querySelector('[data-filter="mismatch"]') as HTMLButtonElement).click();
    expect(doc.querySelectorAll("article:not([hidden])")).toHaveLength(1);
    expect(doc.querySelector("article:not([hidden])")?.id).toBe("comment-2");
    expect(doc.getElementById("visible-count")?.textContent).toBe("1개 표시 중");
  });
  it("partitions unrated failures and pending cases without double counting", async () => {
    const { cases, report } = await sample();
    report.records["3"].error = "unrated failure"; report.records["3"].result = null;
    delete report.records["1"];
    const stats = comparisonStats(cases, report);
    expect(stats.matched + stats.mismatched + stats.awaitingReview + stats.errors + stats.pending).toBe(stats.total);
    expect(stats).toMatchObject({ errors: 2, awaitingReview: 0, pending: 1, compared: 2, agreement: .5 });
    const doc = new DOMParser().parseFromString(buildComparisonDocument(cases, report), "text/html");
    new Function("document", doc.querySelector("script")!.textContent)(doc);
    (doc.querySelector('[data-filter="unrated"]') as HTMLButtonElement).click();
    expect(doc.querySelectorAll("article:not([hidden])")).toHaveLength(0);
    (doc.querySelector('[data-filter="error"]') as HTMLButtonElement).click();
    expect(doc.querySelectorAll("article:not([hidden])")).toHaveLength(2);
  });
  it("shows v3 interpretation, original numbers and a neutral HOLD reason outside protected details", async () => {
    const { cases, report } = await sample();
    const result = report.records["0"].result!;
    result.analysis.meaningClear = false;
    result.analysis.uninterpretableReason = "축약 표현의 뜻을 복원할 수 없습니다.";
    result.analysis.interpretation = {
      addressees: [{ target: "unknown", evidence: [] }],
      speechActs: [{ type: "other", evidence: [{ source: "comment", quote: "좋아요" }] }],
      literalMeaning: "핵심 표현을 해석할 수 없다.", impliedMeaning: null,
      missingContext: ["축약 표현이 무엇을 가리키는지 확인 필요"],
    };
    result.verdict.level = "hold";
    report.presentation = { title: "Luna v3", note: "선택한 사례만 비교", baselineLabel: "Luna v2", sourceNumbers: { "0": 66, "1": 70, "2": 86, "3": 101 } };
    const doc = new DOMParser().parseFromString(buildComparisonDocument(cases, report), "text/html");
    const card = doc.getElementById("comment-66")!;
    expect(card.querySelector(".hold-reason")?.textContent).toContain("축약 표현의 뜻");
    expect(card.querySelector(".hold-reason")?.closest("details")).toBeNull();
    expect(card.querySelector("details.analysis")?.hasAttribute("open")).toBe(false);
    const headings = [...card.querySelectorAll("details.analysis h4")].map(h => h.textContent);
    expect(headings).toEqual(["대화 상대", "발화 의도", "명시된 뜻", "확인되는 함의", "부족한 문맥", "추출한 피드백", "공격 분석"]);
    expect(doc.querySelectorAll("details.source[open]")).toHaveLength(0);
    expect(cases[0].expected).toBe("safe");
    result.analysis.uninterpretableReason = cases[0].sourceText;
    const redacted = new DOMParser().parseFromString(buildComparisonDocument(cases, report), "text/html");
    expect(redacted.querySelector(".hold-reason")?.textContent).not.toContain(cases[0].sourceText);
  });
});
