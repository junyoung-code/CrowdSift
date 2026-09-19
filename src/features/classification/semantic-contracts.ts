import { z } from "zod";
import type { ModelRun } from "./contracts";

export const SEMANTIC_PIPELINE_VERSION = "semantic-v1";
export const SEMANTIC_POLICY_VERSION = "creator-feedback-v1";
export const SemanticTargetSchema = z.enum(["creator", "content", "other_commenter", "third_party", "self", "general", "unknown"]);
export const HarmTypeSchema = z.enum(["personal_attack", "mockery", "sexual_degradation", "appearance_attack", "threat", "dehumanization", "motive_speculation", "harassment", "insult", "hate", "personal_info"]);
export const FeedbackClaimSchema = z.object({
  id: z.string().min(1), content: z.string().min(1),
  kind: z.enum(["actionable", "preference", "question", "experience"]),
  evidence: z.array(z.string().min(1)).min(1),
}).strict();
export const SemanticAnalysisV1Schema = z.object({
  meaningClear: z.boolean(), uninterpretableReason: z.string().min(1).nullable(),
  coreMeaning: z.string().min(1), target: SemanticTargetSchema,
  feedbackClaims: z.array(FeedbackClaimSchema),
  harms: z.array(z.object({
    id: z.string().min(1), type: HarmTypeSchema, target: SemanticTargetSchema,
    content: z.string().min(1), severity: z.enum(["low", "medium", "high", "critical"]),
    criticalHarm: z.boolean(), evidence: z.array(z.string().min(1)).min(1),
    expression: z.enum(["asserted", "endorsed", "quoted", "rejected"]),
  }).strict()),
  remainingFeedbackClaimIds: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1), uncertainties: z.array(z.string()),
}).strict();
const InterpretationEvidenceSchema = z.object({
  source: z.enum(["comment", "parent", "title"]), quote: z.string().min(1),
}).strict();
export const InterpretationSchema = z.object({
  addressees: z.array(z.object({
    target: z.enum(["creator", "parent_author", "viewers", "other", "unknown"]),
    evidence: z.array(InterpretationEvidenceSchema),
  }).strict()).min(1),
  speechActs: z.array(z.object({
    type: z.enum(["fact", "question", "suggestion", "praise", "defense", "complaint", "mockery", "other"]),
    evidence: z.array(InterpretationEvidenceSchema).min(1),
  }).strict()).min(1),
  literalMeaning: z.string().min(1),
  impliedMeaning: z.object({ text: z.string().min(1), evidence: z.array(InterpretationEvidenceSchema).min(1) }).strict().nullable(),
  missingContext: z.array(z.string().min(1)),
}).strict();
// New calls require interpretation first. Old persisted analyses remain readable as-is.
export const SemanticAnalysisV2Schema = z.object({ interpretation: InterpretationSchema, ...SemanticAnalysisV1Schema.shape }).strict();
export const SemanticAnalysisSchema = SemanticAnalysisV1Schema.extend({ interpretation: InterpretationSchema.optional() });
export const semanticAnalysisSchemaFor = (profile?: string) => profile === "context-v3" ? SemanticAnalysisV2Schema : SemanticAnalysisV1Schema;
export type SemanticAnalysis = z.infer<typeof SemanticAnalysisSchema>;
export type FeedbackClaim = z.infer<typeof FeedbackClaimSchema>;
export const SemanticContextSchema = z.object({
  commentId: z.string().min(1), workspaceId: z.string().min(1), sourceText: z.string().min(1), videoTitle: z.string(),
  parent: z.object({ id: z.string(), text: z.string() }).nullable(),
  allowedContexts: z.array(z.object({ phrase: z.string(), context: z.string() })),
  corrections: z.array(z.object({ text: z.string(), reason: z.string().min(1), context: z.string().nullable() })),
}).strict();
export type SemanticContext = z.infer<typeof SemanticContextSchema>;
export const FeedbackRewriteSchema = z.object({
  text: z.string().min(1), preservedClaimIds: z.array(z.string().min(1)),
}).strict();
export type FeedbackRewrite = z.infer<typeof FeedbackRewriteSchema>;
export const RewriteValidationSchema = z.object({
  harmRemoved: z.boolean(), claimsPreserved: z.boolean(), intensityPreserved: z.boolean(),
  nothingAdded: z.boolean(), issues: z.array(z.string().min(1)),
}).strict();
export type RewriteValidation = z.infer<typeof RewriteValidationSchema>;
export type ModelOutput<T> = { result: T; run: ModelRun };
export interface SemanticAnalyzer { analyze(context: SemanticContext): Promise<ModelOutput<SemanticAnalysis>> }
export interface FeedbackRewriter { rewrite(input: { claims: FeedbackClaim[]; previousIssues: string[] }): Promise<ModelOutput<FeedbackRewrite>> }
export interface RewriteValidator { validate(input: { source: string; analysis: SemanticAnalysis; rewrite: FeedbackRewrite }): Promise<ModelOutput<RewriteValidation>> }
export type SemanticProviders = { analyzer: SemanticAnalyzer; rewriter: FeedbackRewriter; validator: RewriteValidator };

export class SemanticOutputError extends Error {
  constructor(message: string, public readonly modelOutput?: { run: ModelRun; output: unknown }) { super(message); this.name = "SemanticOutputError"; }
}

/** Evidence validation is structural. Semantic faithfulness is evaluated separately. */
export function validateSemanticAnalysis(value: unknown, input: string | SemanticContext, profile?: string): SemanticAnalysis {
  const source = typeof input === "string" ? input : input.sourceText;
  const analysis: SemanticAnalysis = (profile === "context-v3" ? SemanticAnalysisV2Schema : SemanticAnalysisSchema).parse(value);
  if (analysis.meaningClear === Boolean(analysis.uninterpretableReason)) throw new SemanticOutputError("meaning_reason_inconsistent");
  const claims = new Set(analysis.feedbackClaims.map(c => c.id));
  if (claims.size !== analysis.feedbackClaims.length || new Set(analysis.harms.map(h => h.id)).size !== analysis.harms.length) throw new SemanticOutputError("duplicate_evidence_id");
  if (new Set(analysis.remainingFeedbackClaimIds).size !== analysis.remainingFeedbackClaimIds.length || analysis.remainingFeedbackClaimIds.some(id => !claims.has(id))) throw new SemanticOutputError("invalid_remaining_claim_reference");
  for (const part of [...analysis.feedbackClaims, ...analysis.harms]) {
    if (part.evidence.some(excerpt => !source.includes(excerpt))) throw new SemanticOutputError("evidence_not_in_source");
  }
  if (analysis.interpretation) {
    const i = analysis.interpretation;
    const sources = { comment: source, parent: typeof input === "string" ? null : input.parent?.text, title: typeof input === "string" ? null : input.videoTitle };
    const evidence = [...i.addressees.flatMap(a => a.evidence), ...i.speechActs.flatMap(a => a.evidence), ...(i.impliedMeaning?.evidence ?? [])];
    if (evidence.some(e => !sources[e.source]?.includes(e.quote))) throw new SemanticOutputError("interpretation_evidence_not_in_source");
    if (i.addressees.some(a => a.target !== "unknown" && !a.evidence.length)) throw new SemanticOutputError("addressee_evidence_missing");
    if (i.addressees.some(a => a.target === "parent_author") && (typeof input === "string" || !input.parent)) throw new SemanticOutputError("parent_addressee_without_parent");
    if (!analysis.meaningClear && !i.missingContext.length) throw new SemanticOutputError("hold_missing_context_required");
  }
  return analysis;
}

export function remainingClaims(analysis: SemanticAnalysis): FeedbackClaim[] {
  const ids = new Set(analysis.remainingFeedbackClaimIds);
  return analysis.feedbackClaims.filter(c => ids.has(c.id));
}
export const activeHarms = (analysis: SemanticAnalysis) => analysis.harms.filter(h => h.expression === "asserted" || h.expression === "endorsed");
export const rewriteAccepted = (result: RewriteValidation) => result.harmRemoved && result.claimsPreserved && result.intensityPreserved && result.nothingAdded && result.issues.length === 0;

export function validateRewriteClaims(rewrite: FeedbackRewrite, claims: FeedbackClaim[]) {
  const expected = new Set(claims.map(c => c.id));
  if (rewrite.preservedClaimIds.length !== expected.size || new Set(rewrite.preservedClaimIds).size !== expected.size || rewrite.preservedClaimIds.some(id => !expected.has(id))) {
    throw new SemanticOutputError("rewrite_claim_coverage_mismatch");
  }
}
