"use server";
import { requireViewer } from "@/features/auth/require-viewer";
import { readPolicyEditor, type PolicyPreviewResult } from "@/features/policies/policy-editor";
import { getServerEnv } from "@/lib/env";
import { semanticSettingsFromEnv } from "@/features/classification/semantic-settings";
import { createSemanticProviders } from "@/features/classification/semantic-providers";
import { runSemanticPipeline } from "@/features/classification/semantic-service";

export async function previewCreatorPolicyAction(data: FormData): Promise<PolicyPreviewResult> {
  const { workspaceId } = await requireViewer();
  const parsed = readPolicyEditor(data);
  const text = String(data.get("comment") ?? "").trim();
  const environment = getServerEnv();
  const fixture = environment.EXTERNAL_PROVIDER_MODE === "fixture";
  if (!parsed.success || !text || text.length > 2000) return {level:null,fixture,error:"기준과 댓글 입력을 확인해 주세요. 댓글은 2,000자까지 가능해요."};
  try {
    const settings = semanticSettingsFromEnv();
    const providers = createSemanticProviders(settings,environment.OPENAI_API_KEY,environment.ALLOW_FIXTURE_PROVIDERS);
    const result = await runSemanticPipeline({snapshot:{configurationKey:"preview",settings,context:{commentId:"preview",workspaceId,sourceText:text,videoTitle:"",parent:null,allowedContexts:parsed.data.contexts.filter(c=>c.context),corrections:[]}},attempts:[],verdict:null,rewriteStatus:"pending"},providers,{
      async saveAttempt(){},async saveVerdict(){},async saveRewrite(){},
    });
    const reasons = {safe:"크리에이터 대상 공격 없이 전달되는 의견이나 반응이에요.",caution:"공격을 제거해도 전달할 피드백이 남아요.",risk:"공격을 제거하면 전달할 피드백이 남지 않아요.",hold:"댓글의 의미 자체를 복원하기 어려워요."};
    return {level:result.verdict.level==="hold"?null:result.verdict.level==="risk"?"danger":result.verdict.level,fixture,reason:reasons[result.verdict.level]};
  } catch(error) {
    return {level:null,fixture,error:error instanceof Error && error.message==="semantic_models_not_configured"?"의미 분석·재작성·검증 모델을 먼저 설정해 주세요.":"지금은 분석할 수 없어요. 잠시 후 다시 시도해 주세요."};
  }
}
