"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireViewer } from "@/features/auth/require-viewer";
import {
  saveCreatorPolicyVersion,
  type CreatorPolicyRepository,
} from "@/features/policies/policy-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const policyFormSchema = z.object({
  blocked: z.string().max(10_000),
  allowed: z.string().max(10_000),
  contextExceptions: z.string().max(10_000),
  sensitivity: z.enum(["low", "standard", "high"]),
  cautionAction: z.enum(["none", "review", "hold_for_review"]),
  riskAction: z.enum(["none", "review", "hold_for_review"]),
  harmfulTextHidden: z.boolean(),
});

export const saveCreatorPolicyAction = async (formData: FormData) => {
  const parsed = policyFormSchema.safeParse({
    blocked: formData.get("blocked") ?? "",
    allowed: formData.get("allowed") ?? "",
    contextExceptions: formData.get("contextExceptions") ?? "",
    sensitivity: formData.get("sensitivity"),
    cautionAction: formData.get("cautionAction"),
    riskAction: formData.get("riskAction"),
    harmfulTextHidden: formData.get("harmfulTextHidden") === "on",
  });

  if (!parsed.success) {
    redirect("/app/settings/moderation?error=invalid_policy");
  }

  const { userId, workspaceId } = await requireViewer();
  const supabase = await createServerSupabaseClient();
  const repository: CreatorPolicyRepository = {
    async createVersion(input) {
      const { data, error } = await supabase.rpc(
        "create_creator_policy_version",
        {
          target_workspace_id: input.workspaceId,
          target_category_sensitivity: {
            level: input.sensitivity,
          },
          target_preferred_actions: {
            caution: input.cautionAction,
            risk: input.riskAction,
          },
          target_harmful_text_hidden: input.harmfulTextHidden,
          target_phrase_rules: input.phraseRules.map((phraseRule) => ({
            kind: phraseRule.kind,
            phrase: phraseRule.phrase,
            normalizedPhrase: phraseRule.normalizedPhrase,
            contextNote: phraseRule.contextNote,
          })) as Json,
        },
      );
      const created = data?.[0];

      if (error || !created) {
        throw error ?? new Error("Policy version was not created");
      }

      return {
        policyId: created.policy_id,
        version: created.policy_version,
      };
    },
  };

  let result;
  try {
    result = await saveCreatorPolicyVersion({
      repository,
      workspaceId,
      actorUserId: userId,
      ...parsed.data,
    });
  } catch {
    redirect("/app/settings/moderation?error=policy_save_failed");
  }

  revalidatePath("/app/settings/moderation");
  redirect(`/app/settings/moderation?saved=${result.version}`);
};
