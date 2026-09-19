import { digest, type SemanticCase } from "../src/evaluation/semantic-evaluation";
import { semanticConfigurationKey, type SemanticSettings } from "../src/features/classification/semantic-settings";
import { comparisonStats, type ComparisonReport } from "./semantic-comparison-report";
import { evaluationRow } from "./semantic-recording";

export type ModelPrices = Record<string, { inputPerMillion: number; outputPerMillion: number }>;
export type ComparisonPresentation = { title: string; note: string; sourceNumbers: Record<string, number>; baselineLabel: string };
export type ComparisonOptions = { baseline?: ComparisonReport; originalCases?: SemanticCase[]; prices?: ModelPrices; presentation?: ComparisonPresentation };

const inputIdentity = (c: SemanticCase) => [c.id, c.sourceText, c.videoTitle, c.parentText];
export function validateComparisonBaseline(cases: SemanticCase[], options: ComparisonOptions) {
  if (!options.baseline && !options.originalCases) return;
  if (!options.baseline || !options.originalCases) throw new Error("baseline_and_original_dataset_required");
  comparisonStats(options.originalCases, options.baseline);
  const originals = new Map(options.originalCases.map(c => [c.id, c]));
  if (cases.length !== originals.size || cases.some(c => !originals.has(c.id) || digest(inputIdentity(c)) !== digest(inputIdentity(originals.get(c.id)!)))) {
    throw new Error("baseline_comment_context_mismatch");
  }
  for (const c of cases) {
    const context = options.baseline.records[c.id]?.state.snapshot.context;
    if (context && (context.commentId !== c.id || context.sourceText !== c.sourceText || context.videoTitle !== c.videoTitle || (context.parent?.text ?? null) !== c.parentText)) throw new Error("baseline_record_context_mismatch");
  }
}

/** Validate every record before the runner can skip a completed success. */
export function validateComparisonResume(report: ComparisonReport, cases: SemanticCase[], settings: SemanticSettings, options: ComparisonOptions) {
  const key = semanticConfigurationKey(settings, 1);
  if (report.schemaVersion !== "semantic-human-comparison-v1" || report.datasetDigest !== digest(cases) || semanticConfigurationKey(report.settings, 1) !== key || (report.configurationKey && report.configurationKey !== key)) throw new Error("Resume dataset/settings mismatch");
  if ((report.baselineDigest ?? null) !== (options.baseline ? digest(options.baseline) : null) || (report.originalDatasetDigest ?? null) !== (options.originalCases ? digest(options.originalCases) : null) || digest(report.prices ?? null) !== digest(options.prices ?? null)) throw new Error("Resume comparison inputs mismatch");
  if (digest(report.presentation ?? null) !== digest(options.presentation ?? null)) throw new Error("Resume presentation mismatch");
  const ids = new Set(cases.map(c => c.id));
  for (const [id, record] of Object.entries(report.records)) {
    const c = cases.find(c => c.id === id);
    const context = record.state.snapshot.context;
    if (!ids.has(id) || record.state.snapshot.configurationKey !== key || semanticConfigurationKey(record.state.snapshot.settings, 1) !== key || record.contextDigest !== digest(context) || context.commentId !== id || context.sourceText !== c?.sourceText || context.videoTitle !== c?.videoTitle || (context.parent?.text ?? null) !== c?.parentText) throw new Error("Resume record configuration/context mismatch");
  }
}

export function comparisonUsage(report: ComparisonReport, prices?: ModelPrices) {
  const rows = Object.entries(report.records).map(([id, r]) => evaluationRow(id, r, prices));
  const times = rows.map(r => r.latencyMs).sort((a, b) => a - b);
  return {
    inputTokens: rows.reduce((sum, r) => sum + r.inputTokens, 0), outputTokens: rows.reduce((sum, r) => sum + r.outputTokens, 0),
    calls: Object.values(report.records).reduce((sum, r) => sum + r.state.attempts.length, 0),
    estimatedUSD: rows.length && rows.every(r => r.cost !== null) ? rows.reduce((sum, r) => sum + r.cost!, 0) : null,
    incompleteUsage: rows.filter(r => !r.usageComplete).length,
    medianLatencyMs: times.length ? times[Math.floor(times.length / 2)] : null,
    p95LatencyMs: times.length ? times[Math.min(times.length - 1, Math.ceil(times.length * .95) - 1)] : null,
    rewriteAccepted: rows.filter(r => r.rewriteStatus === "accepted").length,
    rewriteFailed: rows.filter(r => r.rewriteStatus === "failed").length,
  };
}

export function comparisonSummary(cases: SemanticCase[], report: ComparisonReport, options: ComparisonOptions = {}) {
  validateComparisonBaseline(cases, options);
  const baseline = options.baseline;
  return {
    current: comparisonStats(cases, report), usage: comparisonUsage(report, options.prices),
    baselineOnRevisedLabels: baseline ? comparisonStats(cases, { ...baseline, datasetDigest: digest(cases) }) : null,
    baselineOnOriginalLabels: baseline ? comparisonStats(options.originalCases!, baseline) : null,
    currentOnOriginalLabels: options.originalCases ? comparisonStats(options.originalCases, { ...report, datasetDigest: digest(options.originalCases) }) : null,
    baselineUsage: baseline ? comparisonUsage(baseline, options.prices) : null,
    changedGrades: baseline ? cases.filter(c => (report.records[c.id]?.result?.verdict.level ?? null) !== (baseline.records[c.id]?.result?.verdict.level ?? null)).map(c => c.id) : [],
  };
}
