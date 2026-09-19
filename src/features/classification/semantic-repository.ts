import "server-only";
import type { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import type { ClassificationWorkItem } from "./classification-service";
import { createOpenAIEmbedding } from "./openai-embedding";
import { runSemanticPipeline, semanticPublicTrace, type SemanticAttempt, type SemanticSnapshot, type SemanticState } from "./semantic-service";
import { SemanticSettingsSchema, semanticConfigurationKey, type SemanticSettings } from "./semantic-settings";
import { SemanticContextSchema, SEMANTIC_PIPELINE_VERSION, remainingClaims, type SemanticProviders, type SemanticAnalysis } from "./semantic-contracts";
import type { SemanticVerdict } from "./semantic-policy";

type Admin = ReturnType<typeof createAdminSupabaseClient>;
const json = (value: unknown) => value as Json;

export async function processSemanticWorkItem({ admin, item, settings, configurationKey, providers, apiKey, embeddingModel }: {
  admin: Admin; item: ClassificationWorkItem; settings: SemanticSettings; configurationKey: string;
  providers: SemanticProviders; apiKey: string; embeddingModel: string;
}) {
  const { data: initialSnapshot, error } = await admin.from("semantic_snapshots").select("*").eq("analysis_job_item_id",item.id).eq("workspace_id",item.workspaceId).maybeSingle();
  let snapshot = initialSnapshot;
  if (error) throw error;
  if (!snapshot) {
    const context: SemanticSnapshot["context"] = { commentId:item.rawCommentId,workspaceId:item.workspaceId,sourceText:item.sourceText,videoTitle:item.videoTitle,parent:item.parent,
      allowedContexts:item.sourceKind === "owned_oauth" ? item.profile.allowedContexts ?? [] : [],corrections:[] };
    if (item.sourceKind === "owned_oauth" && settings.provider !== "fixture") {
      try {
        const embedding = await createOpenAIEmbedding({apiKey,model:embeddingModel}).embed(item.sourceText);
        const { data: matches, error: matchError } = await admin.rpc("match_classification_feedback",{target_workspace_id:item.workspaceId,query_embedding:JSON.stringify(embedding.vector),match_threshold:0.5,match_count:3});
        if (matchError) throw matchError;
        if (matches?.length) {
          const { data: corrections, error: correctionError } = await admin.from("classification_feedback").select("id,correction_reason,application_context").eq("workspace_id",item.workspaceId).eq("use_for_personalization",true).in("id",matches.map(m=>m.feedback_id)).not("correction_reason","is",null);
          if (correctionError) throw correctionError;
          context.corrections = (corrections ?? []).flatMap(c=>c.correction_reason ? [{text:matches.find(m=>m.feedback_id===c.id)?.source_text ?? "",reason:c.correction_reason,context:c.application_context}] : []);
        }
      } catch {
        // Retrieval is optional, but a missing retrieval must be observable.
        const { error: logError } = await admin.from("audit_logs").insert({workspace_id:item.workspaceId,event_type:"classification.context_lookup_failed",target_type:"analysis_job_item",target_id:item.id,metadata:{}});
        if (logError) throw logError;
      }
    }
    const inserted = await admin.from("semantic_snapshots").insert({analysis_job_item_id:item.id,workspace_id:item.workspaceId,raw_comment_id:item.rawCommentId,configuration_key:configurationKey,context:json(context),settings:json(settings)}).select("*").single();
    if (inserted.error || !inserted.data) throw inserted.error ?? new Error("snapshot_missing");
    snapshot=inserted.data;
  }
  if (snapshot.configuration_key !== configurationKey || semanticConfigurationKey(SemanticSettingsSchema.parse(snapshot.settings), item.policyVersion) !== configurationKey) throw new Error("semantic_snapshot_configuration_mismatch");
  const [{data:runs,error:runsError},{data:storedVerdict,error:verdictError},{data:retry,error:retryError}] = await Promise.all([
    admin.from("semantic_attempts").select("*").eq("analysis_job_item_id",item.id).eq("workspace_id",item.workspaceId).order("created_at").order("attempt"),
    admin.from("classification_verdicts").select("id,rewrite_status").eq("analysis_job_item_id",item.id).eq("workspace_id",item.workspaceId).maybeSingle(),
    admin.from("audit_logs").select("created_at,metadata").eq("workspace_id",item.workspaceId).eq("target_id",item.id).eq("event_type","classification.rewrite_retry").order("created_at",{ascending:false}).limit(1).maybeSingle(),
  ]);
  if (runsError || verdictError || retryError) throw runsError ?? verdictError ?? retryError;
  const allRuns = runs ?? [];
  const boundary = (retry?.metadata as { afterAttempts?: Record<string, number> } | null)?.afterAttempts;
  const offsets = new Map<string, number>();
  for (const stage of ["feedback_rewrite", "rewrite_validation"]) {
    offsets.set(stage, boundary?.[stage] ?? Math.max(0, ...allRuns.filter(r => r.stage === stage && retry && r.created_at <= retry.created_at).map(r => r.attempt)));
  }
  const eligibleRuns = allRuns.filter(r => r.stage === "semantic_analysis" || r.attempt > (offsets.get(r.stage) ?? 0));
  const state: SemanticState = {snapshot:{context:SemanticContextSchema.parse(snapshot.context),settings:snapshot.settings as unknown as SemanticSettings,configurationKey},
    attempts:eligibleRuns.map(r=>({stage:r.stage as SemanticAttempt["stage"],attempt:r.attempt,status:r.status as SemanticAttempt["status"],output:r.output,run:r.model_run as unknown as SemanticAttempt["run"],errorCode:r.error_code})),verdict:null,rewriteStatus:(storedVerdict?.rewrite_status ?? "pending") as SemanticState["rewriteStatus"]};
  if (state.snapshot.context.workspaceId !== item.workspaceId || state.snapshot.context.commentId !== item.rawCommentId) throw new Error("semantic_snapshot_context_mismatch");
  let verdictId = storedVerdict?.id;
  let analysis: SemanticAnalysis;
  let verdict: SemanticVerdict;
  // Offset explicit rewrite cycles so audit attempts are append-only across user retries.

  // The service numbers attempts within a cycle; normalize loaded attempts accordingly.
  state.attempts = state.attempts.map(a=>({...a,attempt:a.attempt-(offsets.get(a.stage)??0)}));
  return runSemanticPipeline(state,providers,{
    async saveAttempt(attempt) {
      const {error} = await admin.from("semantic_attempts").insert({analysis_job_item_id:item.id,workspace_id:item.workspaceId,stage:attempt.stage,attempt:attempt.attempt+(offsets.get(attempt.stage)??0),status:attempt.status,output:json(attempt.output),model_run:json(attempt.run),error_code:attempt.errorCode});
      if(error) throw error;
    },
    async saveVerdict(result, semantic) {
      analysis=semantic; verdict=result;
      const claims=remainingClaims(analysis);
      const status: SemanticState["rewriteStatus"] = result.allowRewrite ? state.rewriteStatus === "not_required" ? "pending" : state.rewriteStatus : "not_required";
      const {data,error} = await admin.from("classification_verdicts").upsert({analysis_job_item_id:item.id,workspace_id:item.workspaceId,raw_comment_id:item.rawCommentId,
        pipeline_version:SEMANTIC_PIPELINE_VERSION,status:result.level==="hold"?"review_queue":"decided",level:result.level==="hold"?null:result.level,basis:result.basis,
        allow_rewrite:result.allowRewrite,hide_source:result.hideSource,feedback_type:claims.some(c=>c.kind==="question")?"question":claims.some(c=>c.kind==="actionable")?"actionable":claims.length?"preference":"none",
        feedback_core:claims.length?claims.map(c=>c.content).join(" "):null,reason_codes:analysis.harms.map(h=>h.type),recommended_actions:result.hideSource?["hide_source"]:["show_source"],
        raised_by_moderation:false,raised_by_spam:false,spam_signals:result.spamSignals,rewrite_status:status,semantic_trace:json(semanticPublicTrace(analysis,result,status)),
      },{onConflict:"analysis_job_item_id"}).select("id").single();
      if(error || !data) throw error ?? new Error("verdict_missing"); verdictId=data.id;
    },
    async saveRewrite(rewrite,status,issues) {
      if(!verdictId) throw new Error("verdict_missing");
      if(rewrite && status==="accepted") {
        const {error}=await admin.from("classification_rewrites").upsert({analysis_job_item_id:item.id,workspace_id:item.workspaceId,raw_comment_id:item.rawCommentId,classification_verdict_id:verdictId,rewritten:rewrite.text,tone_variant:"neutral",accepted:true,rejections:[]},{onConflict:"analysis_job_item_id"});
        if(error) throw error;
      }
      const {error}=await admin.from("classification_verdicts").update({rewrite_status:status,semantic_trace:json(semanticPublicTrace(analysis,verdict,status))}).eq("id",verdictId).eq("workspace_id",item.workspaceId);
      if(error) throw error;
      if(status==="failed") {
        const {error:logError}=await admin.from("audit_logs").insert({workspace_id:item.workspaceId,event_type:"classification.rewrite_rejected",target_type:"analysis_job_item",target_id:item.id,metadata:{issueCount:issues.length}});
        if(logError) throw logError;
      }
    },
  });
}
