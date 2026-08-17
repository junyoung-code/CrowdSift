"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireViewer } from "@/features/auth/require-viewer";
import {
  saveCreatorPolicyVersion,
  type CreatorPolicyRepository,
} from "@/features/policies/policy-service";
import { toClassificationProfileUpdate } from "@/features/policies/policy-to-classification-profile";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
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
  let dropped: string[] = [];
  /**
   * 어디서 깨졌는지 남긴다.
   *
   * 둘을 한 덩어리로 삼키면 화면은 「저장하지 못했습니다」만 말하고, 정책 버전이
   * 문제인지 프로필 쓰기가 문제인지 알 수 없다. 실제로 그것 때문에 한 번 헛돌았다.
   */
  let stage: "policy" | "profile" = "policy";

  try {
    result = await saveCreatorPolicyVersion({
      repository,
      workspaceId,
      actorUserId: userId,
      ...parsed.data,
    });
    stage = "profile";

    /**
     * 같은 내용을 분류가 읽는 자리에도 쓴다.
     *
     * 정책 버전은 기록이고, 판단이 실제로 보는 것은 `classification_profiles` 다.
     * 여기까지 오지 않으면 크리에이터가 화면에서 등록한 표현이 다음 댓글에 닿지 않는다.
     */
    const conversion = toClassificationProfileUpdate(parsed.data);
    dropped = conversion.dropped;

    /**
     * 프로필은 admin 클라이언트로 쓴다.
     *
     * `classification_profiles` 에는 읽기 정책만 있고 쓰기 정책이 없어, 사용자 권한
     * 으로는 RLS 가 막는다. 인박스의 「이건 칭찬이에요」도 같은 이유로 admin 을 쓴다.
     * 어느 워크스페이스에 쓸지는 위에서 `requireViewer` 가 정한 것만 쓴다.
     */
    const { error } = await createAdminSupabaseClient()
      .from("classification_profiles")
      .upsert(
        {
          workspace_id: workspaceId,
          protection_level: conversion.profile.protectionLevel,
          allowed_slang: conversion.profile.allowedSlang,
          sensitive_topics: conversion.profile.sensitiveTopics,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        },
        { onConflict: "workspace_id" },
      );
    if (error) throw error;
  } catch {
    redirect(
      stage === "policy"
        ? "/app/settings/moderation?error=policy_save_failed"
        : "/app/settings/moderation?error=profile_save_failed",
    );
  }

  revalidatePath("/app/settings/moderation");
  redirect(
    dropped.length > 0
      ? `/app/settings/moderation?saved=${result.version}&dropped=${dropped.length}`
      : `/app/settings/moderation?saved=${result.version}`,
  );
};
