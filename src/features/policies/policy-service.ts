import { normalizeForMatching } from "@/features/rules/normalize-korean";

export type PolicySensitivity = "low" | "standard" | "high";
export type PolicyAction = "none" | "review" | "hold_for_review";

export type PolicyPhraseRuleInput = {
  kind: "blocked" | "allowed" | "context_exception";
  phrase: string;
  normalizedPhrase: string;
  contextNote: string | null;
};

export type CreatePolicyVersionInput = {
  workspaceId: string;
  actorUserId: string;
  sensitivity: PolicySensitivity;
  cautionAction: PolicyAction;
  riskAction: PolicyAction;
  harmfulTextHidden: boolean;
  phraseRules: PolicyPhraseRuleInput[];
};

export interface CreatorPolicyRepository {
  createVersion(input: CreatePolicyVersionInput): Promise<{
    policyId: string;
    version: number;
  }>;
}

export const parsePolicyPhraseLines = (value: string) =>
  [...new Set(value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];

const toPhraseRules = (
  source: string,
  kind: PolicyPhraseRuleInput["kind"],
): PolicyPhraseRuleInput[] =>
  parsePolicyPhraseLines(source).map((line) => {
    const [phrasePart, ...contextParts] = line.split("|");
    const phrase = phrasePart.trim();
    const contextNote = contextParts.join("|").trim() || null;

    return {
      kind,
      phrase,
      normalizedPhrase: normalizeForMatching(phrase),
      contextNote,
    };
  });

export const saveCreatorPolicyVersion = async ({
  actorUserId,
  allowed,
  blocked,
  cautionAction,
  contextExceptions,
  harmfulTextHidden,
  repository,
  riskAction,
  sensitivity,
  workspaceId,
}: {
  repository: CreatorPolicyRepository;
  workspaceId: string;
  actorUserId: string;
  blocked: string;
  allowed: string;
  contextExceptions: string;
  sensitivity: PolicySensitivity;
  cautionAction: PolicyAction;
  riskAction: PolicyAction;
  harmfulTextHidden: boolean;
}) =>
  repository.createVersion({
    workspaceId,
    actorUserId,
    sensitivity,
    cautionAction,
    riskAction,
    harmfulTextHidden,
    phraseRules: [
      ...toPhraseRules(blocked, "blocked"),
      ...toPhraseRules(allowed, "allowed"),
      ...toPhraseRules(contextExceptions, "context_exception"),
    ],
  });
