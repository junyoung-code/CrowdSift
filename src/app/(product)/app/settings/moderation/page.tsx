import { CheckCircle } from "@phosphor-icons/react/dist/ssr";

import { requireViewer } from "@/features/auth/require-viewer";
import {
  PolicyForm,
  type PolicyFormValues,
} from "@/features/policies/policy-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

import { saveCreatorPolicyAction } from "./actions";

type ModerationSettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const readJsonText = (
  source: Json,
  key: string,
  fallback: string,
) => {
  if (
    typeof source === "object" &&
    source !== null &&
    !Array.isArray(source) &&
    typeof source[key] === "string"
  ) {
    return source[key];
  }

  return fallback;
};

export default async function ModerationSettingsPage({
  searchParams,
}: ModerationSettingsPageProps) {
  const parameters = await searchParams;
  const { workspaceId } = await requireViewer();
  const supabase = await createServerSupabaseClient();
  const { data: policy, error: policyError } = await supabase
    .from("creator_policies")
    .select(
      "id, version, category_sensitivity, preferred_actions, harmful_text_hidden",
    )
    .eq("workspace_id", workspaceId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (policyError) {
    throw new Error("Creator policy could not be loaded");
  }

  const { data: rules, error: rulesError } = policy
    ? await supabase
        .from("phrase_rules")
        .select("kind, phrase, context_note")
        .eq("workspace_id", workspaceId)
        .eq("policy_id", policy.id)
        .eq("enabled", true)
        .order("created_at")
    : { data: [], error: null };

  if (rulesError) {
    throw new Error("Creator phrase rules could not be loaded");
  }

  const linesForKind = (
    kind: "blocked" | "allowed" | "context_exception",
  ) =>
    (rules ?? [])
      .filter((rule) => rule.kind === kind)
      .map((rule) =>
        kind === "context_exception" && rule.context_note
          ? `${rule.phrase} | ${rule.context_note}`
          : rule.phrase,
      )
      .join("\n");
  const initial: PolicyFormValues = {
    version: policy?.version ?? 0,
    blocked: linesForKind("blocked"),
    allowed: linesForKind("allowed"),
    contextExceptions: linesForKind("context_exception"),
    sensitivity: readJsonText(
      policy?.category_sensitivity ?? {},
      "level",
      "standard",
    ) as PolicyFormValues["sensitivity"],
    cautionAction: readJsonText(
      policy?.preferred_actions ?? {},
      "caution",
      "review",
    ) as PolicyFormValues["cautionAction"],
    riskAction: readJsonText(
      policy?.preferred_actions ?? {},
      "risk",
      "hold_for_review",
    ) as PolicyFormValues["riskAction"],
    harmfulTextHidden: policy?.harmful_text_hidden ?? true,
  };

  return (
    <div className="moderation-settings-page">
      <div className="page-heading">
        <div>
          <p>MODERATION POLICY</p>
          <h1>운영 기준</h1>
          <span>
            크리에이터가 싫어하는 표현, 허용할 표현과 예외 맥락을 버전별로
            관리합니다.
          </span>
        </div>
      </div>

      {parameters.saved ? (
        <p className="form-message form-message-success" role="status">
          <CheckCircle aria-hidden="true" weight="fill" />
          운영 기준 버전 {parameters.saved}을 저장했습니다.
        </p>
      ) : null}

      {parameters.error ? (
        <p className="form-message form-message-error" role="alert">
          운영 기준을 저장하지 못했습니다. 입력 내용을 확인하고 다시 시도해
          주세요.
        </p>
      ) : null}

      <PolicyForm action={saveCreatorPolicyAction} initial={initial} />
    </div>
  );
}
