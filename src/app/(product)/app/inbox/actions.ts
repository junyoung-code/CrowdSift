"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireViewer } from "@/features/auth/require-viewer";
import { allowExpression } from "@/features/classification/allow-expression";
import { createOpenAIEmbedding } from "@/features/classification/openai-embedding";
import { parseCreatorCorrectionForm } from "@/features/feedback/feedback-contract";
import { saveCreatorCorrection } from "@/features/feedback/feedback-service";
import { createSupabaseFeedbackRepository } from "@/features/feedback/supabase-feedback-repository";
import { getServerEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const saveCreatorCorrectionAction = async (formData: FormData) => {
  let correction;

  try {
    correction = parseCreatorCorrectionForm(formData);
  } catch {
    redirect("/app/inbox?error=invalid_feedback");
  }

  const { userId, workspaceId } = await requireViewer();
  const admin = createAdminSupabaseClient();
  const environment = getServerEnv();

  try {
    /**
     * 저장과 임베딩을 한 자리에서 한다.
     *
     * 여기서 만든 벡터가 다음 분석의 유사 사례가 된다. 교정만 저장하고 벡터를 만들지
     * 않으면 크리에이터가 고쳐 준 것이 다음 댓글에 닿지 않는다.
     *
     * 개인화에 쓰겠다고 한 것만 임베딩하고, 공개 URL 로 본 댓글은 아예 막는다.
     * 두 규칙 모두 `saveCreatorCorrection` 안에 있다.
     */
    await saveCreatorCorrection(
      { ...correction, workspaceId, actorUserId: userId },
      {
        repository: createSupabaseFeedbackRepository({ supabase: admin }),
        embeddingProvider: createOpenAIEmbedding({
          apiKey: environment.OPENAI_API_KEY,
          model: environment.OPENAI_EMBEDDING_MODEL,
        }),
      },
    );
  } catch {
    redirect("/app/inbox?error=feedback_save_failed");
  }

  revalidatePath("/app/inbox");
  redirect("/app/inbox?feedback=saved");
};

/**
 * 크리에이터가 "이건 우리 채널에선 칭찬이에요" 를 확인했을 때 부른다.
 *
 * 이미 내려진 판단은 건드리지 않는다. 앞으로 오는 댓글이 쓸 재료가 하나 늘 뿐이다.
 * 지난 판단까지 소급해서 바꾸면, 크리에이터가 이미 처리한 목록이 발밑에서 흔들린다.
 */
export const allowChannelExpressionAction = async (formData: FormData) => {
  const expression = String(formData.get("expression") ?? "");

  const { userId, workspaceId } = await requireViewer();
  const admin = createAdminSupabaseClient();

  // redirect 는 예외를 던져 흐름을 끊는다. try 안에서 부르면 성공이 실패로 삼켜진다.
  let outcome: "allowed" | `error=expression_${string}`;

  try {
    const { data: profile, error: readError } = await admin
      .from("classification_profiles")
      .select("allowed_slang")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (readError) throw readError;

    const result = allowExpression({
      current: profile?.allowed_slang ?? [],
      expression,
    });

    if (result.kind === "added") {
      const { error } = await admin.from("classification_profiles").upsert(
        {
          workspace_id: workspaceId,
          allowed_slang: result.allowedSlang,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        },
        { onConflict: "workspace_id" },
      );
      if (error) throw error;
    }

    outcome =
      result.kind === "rejected" ? `error=expression_${result.reason}` : "allowed";
  } catch {
    outcome = "error=expression_save_failed";
  }

  revalidatePath("/app/inbox");
  redirect(
    outcome === "allowed" ? "/app/inbox?expression=allowed" : `/app/inbox?${outcome}`,
  );
};
