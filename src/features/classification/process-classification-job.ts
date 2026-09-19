import "server-only";
import { getServerEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import type { ClassificationJobRepository } from "./classification-service";
import { buildClassificationWorkItems } from "./classification-work-item";
import { toClassificationProfile, withPolicyContexts } from "./profile";
import { isRetryableClassificationFailure, toClassificationFailureCode } from "./classification-errors";
import { describeClassificationError } from "./failure-details";
import { createSemanticProviders } from "./semantic-providers";
import { SemanticSettingsSchema, semanticSettingsFromEnv, semanticConfigurationKey } from "./semantic-settings";
import { processSemanticWorkItem } from "./semantic-repository";

export const processClassificationChunk = async (requestedJobId: string, maxItems = 5) => {
  const environment = getServerEnv();
  const admin = createAdminSupabaseClient();
  const { data: initialJob, error: jobError } = await admin.from("analysis_jobs").select("*").eq("id", requestedJobId).single();
  let job = initialJob;
  if (jobError || !job) throw jobError ?? new Error("job_not_found");
  const currentSettings = semanticSettingsFromEnv();
  if (!job.configuration_key.startsWith("semantic-v1:")) {
    if (job.status === "succeeded" && !job.replacement_job_id) return { status: job.status, total: job.total_count, completed: job.completed_count, failed: job.failed_count, remaining: 0 };
    // Fail configuration/activation checks before creating replacement records.
    createSemanticProviders(currentSettings, environment.OPENAI_API_KEY, environment.ALLOW_FIXTURE_PROVIDERS);
    const { data: policy } = await admin.from("creator_policies").select("version").eq("workspace_id",job.workspace_id).order("version",{ascending:false}).limit(1).maybeSingle();
    const { data: replacement, error } = await admin.rpc("supersede_legacy_classification_job", { target_job_id: job.id, new_configuration_key: semanticConfigurationKey(currentSettings, policy?.version ?? 1), new_execution_config: currentSettings as unknown as Json });
    if (error || !replacement) throw error ?? new Error("replacement_job_missing");
    const loaded = await admin.from("analysis_jobs").select("*").eq("id",replacement).single();
    if (loaded.error || !loaded.data) throw loaded.error ?? new Error("job_not_found");
    job = loaded.data;
  }
  const jobId = job.id;
  const policyVersion = Number(job.configuration_key.split(":")[1]);
  if (!job.execution_config) {
    if (job.configuration_key !== semanticConfigurationKey(currentSettings, policyVersion)) throw new Error("semantic_configuration_changed_before_start");
    const { error } = await admin.from("analysis_jobs").update({execution_config: currentSettings as unknown as Json}).eq("id",jobId).is("execution_config",null);
    if (error) throw error;
    const { data, error: loadError } = await admin.from("analysis_jobs").select("execution_config").eq("id",jobId).single();
    if (loadError || !data) throw loadError ?? new Error("execution_config_missing");
    job.execution_config = data.execution_config;
  }
  const settings = SemanticSettingsSchema.parse(job.execution_config);
  if (job.configuration_key !== semanticConfigurationKey(settings,policyVersion)) throw new Error("semantic_configuration_mismatch");
  const providers = createSemanticProviders(settings, environment.OPENAI_API_KEY, environment.ALLOW_FIXTURE_PROVIDERS);
  const repository: Pick<ClassificationJobRepository,"claimItems" | "completeItem" | "failItem" | "refreshJobProgress"> = {
    async claimItems(targetJobId, targetMaxItems) {
      const { data: claims, error: claimError } = await admin.rpc(
        "claim_analysis_job_items",
        {
          target_analysis_job_id: targetJobId,
          target_max_items: targetMaxItems,
        },
      );
      if (claimError) throw claimError;
      if (!claims?.length) return [];

      const workspaceId = claims[0].workspace_id;
      const rawIds = claims.map((claim) => claim.raw_comment_id);
      const { data: rawComments, error: rawError } = await admin
        .from("raw_comments")
        .select(
          "id, workspace_id, youtube_video_id, youtube_comment_id, parent_youtube_comment_id, text_display, first_import_job_id",
        )
        .eq("workspace_id", workspaceId)
        .in("id", rawIds);
      if (rawError || !rawComments) throw rawError ?? new Error("raw_missing");

      const parentYoutubeIds = [
        ...new Set(
          rawComments
            .map((row) => row.parent_youtube_comment_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const parentRows = parentYoutubeIds.length
        ? await admin
            .from("raw_comments")
            .select(
              "id, workspace_id, youtube_video_id, youtube_comment_id, parent_youtube_comment_id, text_display, first_import_job_id",
            )
            .eq("workspace_id", workspaceId)
            .in("youtube_comment_id", parentYoutubeIds)
        : { data: [], error: null };
      if (parentRows.error) throw parentRows.error;

      const rawCommentsWithParents = [
        ...rawComments,
        ...(parentRows.data ?? []),
      ];

      /**
       * 어떤 경로로 들어온 댓글인지 알아 둔다.
       *
       * 개인화는 소유 채널 댓글에만 쓴다. `raw_comments` 자체에는 그 표시가 없고,
       * 처음 이 댓글을 담아 온 가져오기 작업이 알고 있다.
       */
      const importJobIds = [
        ...new Set([...rawCommentsWithParents.map((row) => row.first_import_job_id), ...(job.import_job_id ? [job.import_job_id] : [])]),
      ];
      const { data: importJobs, error: importJobError } = await admin
        .from("comment_import_jobs")
        .select("id, source_kind")
        .eq("workspace_id", workspaceId)
        .in("id", importJobIds);
      if (importJobError) throw importJobError;
      const sourceKindByJobId = new Map(
        (importJobs ?? []).map((job) => [job.id, job.source_kind]),
      );

      const videoIds = [...new Set(rawComments.map((row) => row.youtube_video_id))];
      const [
        { data: videos, error: videoError },
        { data: policy, error: policyError },
        { data: profileRow, error: profileError },
      ] = await Promise.all([
        admin
          .from("youtube_videos")
          .select("youtube_video_id, youtube_channel_id, title")
          .eq("workspace_id", workspaceId)
          .in("youtube_video_id", videoIds),
        admin
          .from("creator_policies")
          .select("id, version")
          .eq("workspace_id", workspaceId)
          .eq("version", policyVersion)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from("classification_profiles")
          .select(
            "protection_level, allowed_slang, sensitive_topics, hide_personal_attacks, rewrite_tone, emoji_frequency",
          )
          .eq("workspace_id", workspaceId)
          .maybeSingle(),
      ]);
      if (videoError || policyError || profileError || !videos?.length) {
        throw videoError ?? policyError ?? profileError ?? new Error("video_missing");
      }

      const { data: contextRules, error: contextError } = policy
        ? await admin.from("phrase_rules").select("phrase, context_note")
          .eq("workspace_id", workspaceId).eq("policy_id", policy.id)
          .eq("kind", "context_exception").eq("enabled", true)
        : { data: [], error: null };
      if (contextError) throw contextError;

      return buildClassificationWorkItems({
        claims: claims.map((claim) => ({
          itemId: claim.item_id,
          rawCommentId: claim.raw_comment_id,
          workspaceId: claim.workspace_id,
        })),
        rawComments: rawCommentsWithParents.map((row) => ({
          id: row.id,
          workspaceId: row.workspace_id,
          youtubeVideoId: row.youtube_video_id,
          youtubeCommentId: row.youtube_comment_id,
          parentYoutubeCommentId: row.parent_youtube_comment_id,
          textDisplay: row.text_display,
          sourceKind: sourceKindByJobId.get(job.import_job_id ?? row.first_import_job_id) as
            | "owned_oauth"
            | "public_url"
            | undefined,
        })),
        videos: videos.map((video) => ({
          youtubeVideoId: video.youtube_video_id,
          title: video.title,
        })),
        channelId: videos[0].youtube_channel_id,
        policyVersion: policy?.version ?? 1,
        profile: withPolicyContexts(toClassificationProfile(profileRow), contextRules ?? []),
      });
    },
    async completeItem(itemId) {
      const { error } = await admin
        .from("analysis_job_items")
        .update({
          status: "succeeded",
          error_code: null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", itemId);
      if (error) throw error;
    },
    async failItem(itemId, errorCode, detail) {
      const { error: logError } = await admin.from("audit_logs").insert({
        workspace_id: job.workspace_id,
        event_type: "classification.item_failed",
        target_type: "analysis_job_item", target_id: itemId,
        metadata: { analysisJobId: jobId, errorCode, ...detail } as unknown as Json,
      });
      if (logError) throw logError;
      const { error } = await admin
        .from("analysis_job_items")
        .update({
          status: "failed",
          error_code: errorCode,
          finished_at: new Date().toISOString(),
        })
        .eq("id", itemId);
      if (error) throw error;
    },
    async refreshJobProgress(targetJobId) {
      const items: { status: string; attempt_count: number; error_code: string | null }[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await admin.from("analysis_job_items")
          .select("status, attempt_count, error_code").eq("analysis_job_id", targetJobId)
          .order("id").range(offset, offset + 499);
        if (error || !data) throw error ?? new Error("items_missing");
        items.push(...data);
        if (data.length < 500) break;
      }
      const total = items.length;
      const completed = items.filter((row) => row.status === "succeeded").length;
      const failed = items.filter(
        (row) =>
          row.status === "failed" &&
          (row.attempt_count >= 3 ||
            !isRetryableClassificationFailure(row.error_code)),
      ).length;
      const remaining = Math.max(total - completed - failed, 0);
      const status =
        remaining > 0
          ? "running"
          : completed === total
            ? "succeeded"
            : completed > 0
              ? "partially_succeeded"
              : "failed";
      const { error: updateError } = await admin
        .from("analysis_jobs")
        .update({
          status,
          total_count: total,
          completed_count: completed,
          failed_count: failed,
          finished_at: remaining === 0 ? new Date().toISOString() : null,
        })
        .eq("id", targetJobId);
      if (updateError) throw updateError;
      return { status, total, completed, failed, remaining };
    },
  };

  const items = await repository.claimItems(jobId, Math.min(Math.max(maxItems,1),5));
  await Promise.all(items.map(async item => {
    try {
      await processSemanticWorkItem({admin,item,settings,configurationKey:job.configuration_key,providers,apiKey:environment.OPENAI_API_KEY,embeddingModel:environment.OPENAI_EMBEDDING_MODEL});
      await repository.completeItem(item.id);
    } catch(error) {
      await repository.failItem(item.id,toClassificationFailureCode(error),{stage:"semantic_pipeline",error:describeClassificationError(error)});
    }
  }));
  return {...await repository.refreshJobProgress(jobId), ...(jobId !== requestedJobId ? {replacementJobId:jobId} : {})};
};
