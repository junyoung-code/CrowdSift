import type { LunaFirstPass, TerraVerdict } from "./schemas";

/** Check observable consistency, not whether the model's interpretation is correct. */
export function validateAssessment(result: LunaFirstPass | TerraVerdict, source: string): void {
  const evidence = result.assessment;
  if (!evidence) throw new Error("classification_evidence_missing");
  if (evidence.excerpt !== null && !source.includes(evidence.excerpt)) {
    throw new Error("classification_evidence_not_in_source");
  }
  const level = "candidateLevel" in result ? result.candidateLevel : result.verdictLevel;
  if (level !== "safe" && !evidence.excerpt) throw new Error("classification_attack_evidence_missing");
  if (evidence.contextResolution === "resolved") {
    if (evidence.missingContext !== null || result.ambiguityReasons.length || result.certainty === "unclear") {
      throw new Error("classification_context_inconsistent");
    }
  } else if (!evidence.missingContext || !result.ambiguityReasons.length || result.certainty !== "unclear") {
    throw new Error("classification_missing_context_unspecified");
  }
  if (level === "safe" && (result.hardRiskFlags.length || result.softRiskFlags.length)) {
    throw new Error("classification_safe_with_attack_flags");
  }
}
