import { createHash } from "node:crypto";
import { z } from "zod";
import { SemanticAnalysisSchema, validateSemanticAnalysis, type SemanticAnalysis } from "../features/classification/semantic-contracts";
import { classifySemanticAnalysis } from "../features/classification/semantic-policy";

export const levels = ["safe", "caution", "risk", "hold"] as const;
export const LevelSchema = z.enum(levels);
export const SemanticCaseSchema = z.object({
  id: z.string().min(1), group: z.string().min(1), split: z.enum(["development", "holdout"]),
  sourceText: z.string().min(1), videoTitle: z.string(), parentText: z.string().nullable(),
  expected: LevelSchema.nullable(), review: z.object({ reviewer: z.string().min(1), reason: z.string().min(1), reviewedAt: z.string().datetime() }).nullable(),
  tags: z.array(z.string()), goldAnalysis: SemanticAnalysisSchema.nullable(),
});
export const SemanticDatasetSchema = z.object({ schemaVersion: z.literal("semantic-evaluation-v1"), cases: z.array(SemanticCaseSchema).min(1) });
export type SemanticCase = z.infer<typeof SemanticCaseSchema>;
export type EvaluationRow = { id: string; level: typeof levels[number] | null; analysis: SemanticAnalysis | null; error: string | null; latencyMs: number; inputTokens: number; outputTokens: number; cost: number | null; rewriteStatus: string | null; rewriteText: string | null; errorStage?: string | null; usageComplete?: boolean };
// Human alignment is per recorded output, not per unstable model-generated claim ID.
export const AlignmentSchema = z.object({
  rowDigest: z.string(), reviewer: z.string().min(1),
  claims: z.array(z.object({ goldId: z.string(), actualId: z.string() })),
  rewrite: z.object({ informationPreserved: z.boolean(), intensityPreserved: z.boolean(), noAddedMeaning: z.boolean(), harmRemoved: z.boolean() }).nullable(),
});
export type Alignment = z.infer<typeof AlignmentSchema>;
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const normalize = (text: string) => text.toLocaleLowerCase().replace(/[\p{P}\p{S}\s]/gu, "");
const shingles = (text: string) => new Set(Array.from({ length: Math.max(0, text.length - 3) }, (_, i) => text.slice(i, i + 4)));
export function validateDataset(cases: SemanticCase[]) {
  if (new Set(cases.map(c => c.id)).size !== cases.length) throw new Error("duplicate_case_id");
  for (const c of cases) {
    if (c.review && !c.expected) throw new Error(`review_without_label:${c.id}`);
    if (c.goldAnalysis) validateSemanticAnalysis(c.goldAnalysis, { commentId: c.id, workspaceId: "evaluation", sourceText: c.sourceText, videoTitle: c.videoTitle, parent: c.parentText ? { id: "parent", text: c.parentText } : null, allowedContexts: [], corrections: [] });
  }
  for (let i = 0; i < cases.length; i++) for (let j = i + 1; j < cases.length; j++) {
    const a = cases[i], b = cases[j];
    if (a.split === b.split) continue;
    const x = normalize(a.sourceText), y = normalize(b.sourceText);
    const xs = shingles(x), ys = shingles(y);
    const overlap = [...xs].filter(s => ys.has(s)).length;
    const similarity = overlap / Math.max(1, new Set([...xs, ...ys]).size);
    if (a.group === b.group || x === y || similarity >= 0.75) throw new Error(`split_leakage:${a.id}:${b.id}`);
  }
}
const ratio = (n: number, d: number) => d ? n / d : null;
const sameEvidence = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
export function semanticMetrics(gold: SemanticAnalysis, actual: SemanticAnalysis, alignment?: Alignment) {
  const matches = new Map<string, string>();
  if (alignment) {
    for (const pair of alignment.claims) {
      if (!gold.feedbackClaims.some(c => c.id === pair.goldId) || !actual.feedbackClaims.some(c => c.id === pair.actualId) || matches.has(pair.goldId) || [...matches.values()].includes(pair.actualId)) throw new Error("invalid_claim_alignment");
      matches.set(pair.goldId, pair.actualId);
    }
  } else {
    for (const g of gold.feedbackClaims) {
      const a = actual.feedbackClaims.find(a => ![...matches.values()].includes(a.id) && a.content === g.content && sameEvidence(a.evidence, g.evidence));
      if (a) matches.set(g.id, a.id);
    }
  }
  const needsHumanAlignment = !alignment && (matches.size !== gold.feedbackClaims.length || matches.size !== actual.feedbackClaims.length);
  const harmKeys = (analysis: SemanticAnalysis) => analysis.harms.map(h => JSON.stringify([h.type, h.target, h.expression, [...h.evidence].sort()])).sort();
  return {
    meaningClearCorrect: gold.meaningClear === actual.meaningClear, targetCorrect: gold.target === actual.target,
    harmsCorrect: JSON.stringify(harmKeys(gold)) === JSON.stringify(harmKeys(actual)),
    needsHumanAlignment,
    missingClaims: needsHumanAlignment ? null : gold.feedbackClaims.length - matches.size,
    addedClaims: needsHumanAlignment ? null : actual.feedbackClaims.length - matches.size,
    remainingClaimsCorrect: needsHumanAlignment ? null : gold.remainingFeedbackClaimIds.length === actual.remainingFeedbackClaimIds.length && gold.remainingFeedbackClaimIds.every(id => actual.remainingFeedbackClaimIds.includes(matches.get(id) ?? "")),
    remainingValueCorrect: Boolean(gold.remainingFeedbackClaimIds.length) === Boolean(actual.remainingFeedbackClaimIds.length),
  };
}
export function evaluateSemanticRun(cases: SemanticCase[], rows: EvaluationRow[], alignments: Alignment[] = []) {
  const confusion = Object.fromEntries(levels.map(l => [l, Object.fromEntries([...levels, "error"].map(p => [p, 0]))])) as Record<string, Record<string, number>>;
  const semantics: { id: string; metrics: ReturnType<typeof semanticMetrics> | null }[] = [];
  const rewriteReviews: { id: string; accepted: boolean | null }[] = [];
  let correct = 0, labeled = 0, threeCorrect = 0, threeTotal = 0, unnecessaryHold = 0, criticalErrors = 0;
  for (const c of cases) {
    const row = rows.find(r => r.id === c.id);
    const actual = row?.error ? null : row?.level ?? null;
    if (c.expected) {
      labeled++; confusion[c.expected][actual ?? "error"]++;
      correct += Number(c.expected === actual);
      if (c.expected !== "hold") { threeTotal++; threeCorrect += Number(c.expected === actual); }
      if (c.expected !== "hold" && actual === "hold") unnecessaryHold++;
      if ((c.tags.includes("clear_normal") && actual === "risk") || (c.tags.includes("pure_creator_attack") && actual === "safe")) criticalErrors++;
    }
    const alignment = row ? alignments.find(a => a.rowDigest === digest(row)) : undefined;
    if (c.goldAnalysis) semantics.push({ id: c.id, metrics: row?.analysis ? semanticMetrics(c.goldAnalysis, row.analysis, alignment) : null });
    if (c.expected === "caution") rewriteReviews.push({ id: c.id, accepted: alignment?.rewrite ? Object.values(alignment.rewrite).every(Boolean) && row?.rewriteStatus === "accepted" : null });
  }
  const perLevel = Object.fromEntries(levels.map(l => {
    const total = Object.values(confusion[l]).reduce((a, b) => a + b, 0);
    const predicted = levels.reduce((sum, expected) => sum + confusion[expected][l], 0);
    return [l, { total, accuracy: ratio(confusion[l][l], total), precision: ratio(confusion[l][l], predicted), recall: ratio(confusion[l][l], total) }];
  }));
  const minimum = { safe: 100, caution: 100, risk: 100, hold: 30 };
  const releaseEligible = cases.every(c => c.split === "holdout" && c.review && c.expected) && levels.every(l => perLevel[l].total >= minimum[l]) && cases.some(c => c.review && c.goldAnalysis) && cases.some(c => c.tags.includes("clear_normal")) && cases.some(c => c.tags.includes("pure_creator_attack"));
  const accuracy = ratio(threeCorrect, threeTotal);
  const metricPassed = accuracy !== null && accuracy > 0.95 && (perLevel.caution.recall ?? 0) >= 0.95 && (perLevel.risk.recall ?? 0) >= 0.95 && criticalErrors === 0;
  const count = (key: "meaningClearCorrect" | "targetCorrect" | "harmsCorrect") => ratio(semantics.filter(s => s.metrics?.[key]).length, semantics.length);
  return { labeled, correct, accuracy: ratio(correct, labeled), threeLevelAccuracy: accuracy, confusion, perLevel,
    riskToSafe: confusion.risk.safe, safeToRisk: confusion.safe.risk, cautionMisses: perLevel.caution.total - confusion.caution.caution,
    unnecessaryHold, criticalErrors, errorRate: ratio(cases.filter(c => !rows.find(r => r.id === c.id) || rows.find(r => r.id === c.id)?.error).length, cases.length),
    analysis: { annotated: semantics.length, meaningClearAccuracy: count("meaningClearCorrect"), targetAccuracy: count("targetCorrect"), harmAccuracy: count("harmsCorrect"), cases: semantics },
    policy: cases.filter(c => c.review && c.goldAnalysis && c.expected).map(c => ({ id: c.id, passed: classifySemanticAnalysis(c.goldAnalysis!, c.sourceText).level === c.expected })),
    rewriteReviews, meanLatencyMs: rows.length ? rows.reduce((s,r) => s+r.latencyMs,0)/rows.length : null,
    incompleteUsageCount: rows.filter(r=>r.usageComplete===false).length,
    inputTokens: rows.reduce((s,r)=>s+r.inputTokens,0), outputTokens: rows.reduce((s,r)=>s+r.outputTokens,0),
    cost: rows.every(r=>r.cost!==null) ? rows.reduce((s,r)=>s+(r.cost??0),0) : null,
    releaseEligible, metricPassed, releasePassed: releaseEligible && metricPassed,
  };
}
export function repetitionConsistency(runs: EvaluationRow[][]) {
  const ids = [...new Set(runs.flatMap(run => run.map(r => r.id)))];
  return ratio(ids.filter(id => { const rows = runs.map(run => run.find(r => r.id===id)); return rows.every(r=>r && !r.error && r.level===rows[0]?.level); }).length, ids.length);
}
