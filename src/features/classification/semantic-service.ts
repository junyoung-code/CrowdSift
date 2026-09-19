import type { ModelRun } from "./contracts";
import { SemanticOutputError, activeHarms, FeedbackRewriteSchema, remainingClaims, rewriteAccepted, RewriteValidationSchema, validateRewriteClaims, validateSemanticAnalysis, type FeedbackRewrite, type SemanticAnalysis, type SemanticContext, type SemanticProviders } from "./semantic-contracts";
import { classifySemanticAnalysis, type SemanticVerdict } from "./semantic-policy";
import type { SemanticSettings } from "./semantic-settings";

export type SemanticStage = "semantic_analysis" | "feedback_rewrite" | "rewrite_validation";
export type SemanticAttempt = { stage: SemanticStage; attempt: number; status: "succeeded" | "failed"; output: unknown; run: ModelRun | null; errorCode: string | null };
export type SemanticSnapshot = { context: SemanticContext; settings: SemanticSettings; configurationKey: string };
export type SemanticState = { snapshot: SemanticSnapshot; attempts: SemanticAttempt[]; verdict: SemanticVerdict | null; rewriteStatus: "pending" | "accepted" | "failed" | "not_required" };
export interface SemanticRepository {
  saveAttempt(attempt: SemanticAttempt): Promise<void>;
  saveVerdict(verdict: SemanticVerdict, analysis: SemanticAnalysis): Promise<void>;
  saveRewrite(rewrite: FeedbackRewrite | null, status: SemanticState["rewriteStatus"], issues: string[]): Promise<void>;
}

/** Checkpoints survive restarts. Infrastructure/schema failures never become HOLD. */
export async function runSemanticPipeline(state: SemanticState, providers: SemanticProviders, repository: SemanticRepository) {
  const attempts = [...state.attempts];
  const latest = (stage: SemanticStage) => attempts.filter(a => a.stage === stage && a.status === "succeeded").at(-1);
  async function execute<T>(stage: SemanticStage, task: () => Promise<{ result: T; run: ModelRun }>, validate: (value: T) => T): Promise<T> {
    const attempt = Math.max(0, ...attempts.filter(a => a.stage === stage).map(a => a.attempt)) + 1;
    let run: ModelRun | null = null;
    let output: unknown = null;
    let result: T;
    try {
      const produced = await task(); run = produced.run; output = produced.result;
      result = validate(produced.result);
    } catch (error) {
      if (error instanceof SemanticOutputError && error.modelOutput) { run = error.modelOutput.run; output = error.modelOutput.output; }
      const failure: SemanticAttempt = { stage, attempt, status: "failed", output, run, errorCode: error instanceof Error ? error.name : "Error" };
      await repository.saveAttempt(failure);
      throw error;
    }
    const record: SemanticAttempt = { stage, attempt, status: "succeeded", output: result, run, errorCode: null };
    await repository.saveAttempt(record); attempts.push(record);
    return result;
  }
  const source = state.snapshot.context.sourceText;
  const savedAnalysis = latest("semantic_analysis");
  const analysis = savedAnalysis
    ? validateSemanticAnalysis(savedAnalysis.output, state.snapshot.context, state.snapshot.settings.interpretationProfile)
    : await execute("semantic_analysis", () => providers.analyzer.analyze(state.snapshot.context), value => validateSemanticAnalysis(value, state.snapshot.context, state.snapshot.settings.interpretationProfile));
  const verdict = classifySemanticAnalysis(analysis, source);
  // Recompute a pure policy from the exact persisted analysis on every resume.
  await repository.saveVerdict(verdict, analysis);
  if (!verdict.allowRewrite) {
    await repository.saveRewrite(null, "not_required", []);
    return { analysis, verdict, rewrite: null, rewriteStatus: "not_required" as const };
  }
  const claims = remainingClaims(analysis);
  const savedRewrites = attempts.filter(a => a.stage === "feedback_rewrite" && a.status === "succeeded");
  const savedValidations = attempts.filter(a => a.stage === "rewrite_validation" && a.status === "succeeded");
  let previousIssues: string[] = [];
  for (let index = 0; index < 2; index++) {
    const rewrite = savedRewrites[index]
      ? FeedbackRewriteSchema.parse(savedRewrites[index].output)
      : await execute("feedback_rewrite", () => providers.rewriter.rewrite({ claims, previousIssues }), value => {
        const parsed = FeedbackRewriteSchema.parse(value); validateRewriteClaims(parsed, claims); return parsed;
      });
    validateRewriteClaims(rewrite, claims);
    const validation = savedValidations[index]
      ? RewriteValidationSchema.parse(savedValidations[index].output)
      : await execute("rewrite_validation", () => providers.validator.validate({ source, analysis, rewrite }), value => RewriteValidationSchema.parse(value));
    if (rewriteAccepted(validation)) {
      await repository.saveRewrite(rewrite, "accepted", []);
      return { analysis, verdict, rewrite, rewriteStatus: "accepted" as const };
    }
    previousIssues = validation.issues.length ? validation.issues : ["harm_or_meaning_validation_failed"];
  }
  await repository.saveRewrite(null, "failed", previousIssues);
  return { analysis, verdict, rewrite: null, rewriteStatus: "failed" as const };
}

/** Public trace contains no source excerpts, attack text, unvalidated claims or coreMeaning. */
export function semanticPublicTrace(analysis: SemanticAnalysis, verdict: SemanticVerdict, rewriteStatus: SemanticState["rewriteStatus"]) {
  return { version: "semantic-v1", meaningClear: analysis.meaningClear, target: analysis.target,
    feedbackClaimCount: analysis.feedbackClaims.length, remainingClaimCount: verdict.remainingFeedbackClaimIds.length,
    harms: activeHarms(analysis).map(({ type, target, severity, criticalHarm }) => ({ type, target, severity, criticalHarm })),
    confidence: analysis.confidence, criticalHarm: verdict.criticalHarm, harmSeverity: verdict.harmSeverity,
    otherTargetHarm: verdict.otherTargetHarm, spamSignals: verdict.spamSignals, rewriteStatus };
}

export type SemanticPublicTrace = ReturnType<typeof semanticPublicTrace>;
