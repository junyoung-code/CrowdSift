import type { Json } from "@/types/database";

import type { AnalysisWorkItem } from "./analysis-service";

type ClaimRow = {
  itemId: string;
  rawCommentId: string;
  workspaceId: string;
};

type RawCommentRow = {
  id: string;
  workspaceId: string;
  youtubeVideoId: string;
  parentRawCommentId: string | null;
  textDisplay: string;
  textOriginal: string | null;
};

type PolicyRow = {
  version: number;
  categorySensitivity: Json;
  preferredActions: Json;
  harmfulTextHidden: boolean;
};

type RuleRow = {
  id: string;
  kind: "blocked" | "allowed" | "context_exception";
  phrase: string;
  normalizedPhrase: string;
  contextNote: string | null;
  enabled: boolean;
  version: number;
};

const readJsonString = (
  value: Json,
  key: string,
  allowed: readonly string[],
  fallback: string,
) => {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value[key] === "string" &&
    allowed.includes(value[key])
  ) {
    return value[key];
  }

  return fallback;
};

export const buildAnalysisWorkItems = ({
  claims,
  policy,
  rawComments,
  rules,
  videos,
}: {
  claims: ClaimRow[];
  rawComments: RawCommentRow[];
  videos: Array<{ youtubeVideoId: string; title: string }>;
  policy: PolicyRow;
  rules: RuleRow[];
}): AnalysisWorkItem[] => {
  const rawById = new Map(rawComments.map((comment) => [comment.id, comment]));
  const titleByVideoId = new Map(
    videos.map((video) => [video.youtubeVideoId, video.title]),
  );
  const sensitivity = readJsonString(
    policy.categorySensitivity,
    "level",
    ["low", "standard", "high"],
    "standard",
  ) as "low" | "standard" | "high";
  const cautionAction = readJsonString(
    policy.preferredActions,
    "caution",
    ["none", "review", "hold_for_review", "publish", "reject"],
    "review",
  ) as "none" | "review" | "hold_for_review" | "publish" | "reject";
  const riskAction = readJsonString(
    policy.preferredActions,
    "risk",
    ["none", "review", "hold_for_review", "publish", "reject"],
    "hold_for_review",
  ) as "none" | "review" | "hold_for_review" | "publish" | "reject";

  return claims.map((claim) => {
    const source = rawById.get(claim.rawCommentId);

    if (!source || source.workspaceId !== claim.workspaceId) {
      throw new Error("analysis_source_scope_mismatch");
    }

    const parent = source.parentRawCommentId
      ? rawById.get(source.parentRawCommentId)
      : null;

    return {
      id: claim.itemId,
      workspaceId: claim.workspaceId,
      rawCommentId: claim.rawCommentId,
      sourceText: source.textOriginal ?? source.textDisplay,
      videoTitle:
        titleByVideoId.get(source.youtubeVideoId) ?? "YouTube video",
      threadContext: parent
        ? [parent.textOriginal ?? parent.textDisplay]
        : [],
      policy: {
        version: policy.version,
        sensitivity,
        preferredActions: {
          caution: cautionAction,
          risk: riskAction,
        },
        harmfulTextHidden: policy.harmfulTextHidden,
        phraseRules: rules.map((rule) => ({
          kind: rule.kind,
          phrase: rule.phrase,
          contextNote: rule.contextNote,
        })),
      },
      phraseRules: rules.map((rule) => ({
        id: rule.id,
        kind: rule.kind,
        normalizedPhrase: rule.normalizedPhrase,
        contextNote: rule.contextNote,
        enabled: rule.enabled,
        version: rule.version,
      })),
    };
  });
};
