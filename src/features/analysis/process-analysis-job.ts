import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import type { Json } from "@/types/database";

import {
  createAnalysisService,
  type AnalysisJobProgress,
  type AnalysisRepository,
} from "./analysis-service";
import {
  toSanitizedFeedbackRow,
  toStageTwoAnalysisRow,
} from "./analysis-storage";
import { buildAnalysisWorkItems } from "./analysis-work-item";
import { createOpenAIAnalysisProvider } from "./openai-analysis-provider";
import { createRagService } from "./rag-service";
import { createSupabaseRagRepository } from "./supabase-rag-repository";

const isUniqueViolation = (error: { code?: string } | null) =>
  error?.code === "23505";

export const processAnalysisChunk = async (
  jobId: string,
  maxItems = 5,
): Promise<AnalysisJobProgress> => {
  const admin = createAdminSupabaseClient();
  const environment = getServerEnv();
  const provider = createOpenAIAnalysisProvider();
  const ragService = createRagService({
    embeddingProvider: provider,
    repository: createSupabaseRagRepository({
      rpc: (name, input) => admin.rpc(name, input),
    }),
  });
  const repository: AnalysisRepository = {
    async claimPendingItems(targetJobId, targetMaxItems) {
      const { data: job, error: jobError } = await admin
        .from("analysis_jobs")
        .select(
          "id, workspace_id, status, total_count, completed_count, failed_count",
        )
        .eq("id", targetJobId)
        .maybeSingle();

      if (jobError || !job) {
        throw jobError ?? new Error("Analysis job not found");
      }

      if (job.status === "succeeded" || job.status === "failed") {
        return {
          job: {
            id: job.id,
            workspaceId: job.workspace_id,
            status: job.status,
            total: job.total_count,
            completed: job.completed_count,
            failed: job.failed_count,
          },
          items: [],
        };
      }

      const { data: claims, error: claimError } = await admin.rpc(
        "claim_analysis_job_items",
        {
          target_analysis_job_id: targetJobId,
          target_max_items: targetMaxItems,
        },
      );

      if (claimError) {
        throw claimError;
      }
      if (!claims || claims.length === 0) {
        return {
          job: {
            id: job.id,
            workspaceId: job.workspace_id,
            status: job.status,
            total: job.total_count,
            completed: job.completed_count,
            failed: job.failed_count,
          },
          items: [],
        };
      }

      const rawCommentIds = claims.map((claim) => claim.raw_comment_id);
      const { data: claimedRawComments, error: rawError } = await admin
        .from("raw_comments")
        .select(
          "id, workspace_id, youtube_video_id, youtube_comment_id, parent_youtube_comment_id, text_display, text_original",
        )
        .eq("workspace_id", job.workspace_id)
        .in("id", rawCommentIds);

      if (rawError || !claimedRawComments) {
        throw rawError ?? new Error("Analysis source comments were not loaded");
      }

      const parentYouTubeIds = [
        ...new Set(
          claimedRawComments.flatMap((comment) =>
            comment.parent_youtube_comment_id
              ? [comment.parent_youtube_comment_id]
              : [],
          ),
        ),
      ];
      const { data: parentComments, error: parentError } =
        parentYouTubeIds.length > 0
          ? await admin
              .from("raw_comments")
              .select(
                "id, workspace_id, youtube_video_id, youtube_comment_id, parent_youtube_comment_id, text_display, text_original",
              )
              .eq("workspace_id", job.workspace_id)
              .in("youtube_comment_id", parentYouTubeIds)
          : { data: [], error: null };

      if (parentError) {
        throw parentError;
      }

      const allRawComments = [
        ...claimedRawComments,
        ...(parentComments ?? []),
      ];
      const rawIdByYouTubeId = new Map(
        allRawComments.map((comment) => [comment.youtube_comment_id, comment.id]),
      );
      const videoIds = [
        ...new Set(
          claimedRawComments.map((comment) => comment.youtube_video_id),
        ),
      ];
      const [
        { data: videos, error: videosError },
        { data: policy, error: policyError },
      ] = await Promise.all([
        admin
          .from("youtube_videos")
          .select("youtube_video_id, title")
          .eq("workspace_id", job.workspace_id)
          .in("youtube_video_id", videoIds),
        admin
          .from("creator_policies")
          .select(
            "id, version, category_sensitivity, preferred_actions, harmful_text_hidden",
          )
          .eq("workspace_id", job.workspace_id)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (videosError || policyError || !policy) {
        throw videosError ?? policyError ?? new Error("Creator policy missing");
      }

      const { data: rules, error: rulesError } = await admin
        .from("phrase_rules")
        .select(
          "id, kind, phrase, normalized_phrase, context_note, enabled, version",
        )
        .eq("workspace_id", job.workspace_id)
        .eq("policy_id", policy.id);

      if (rulesError) {
        throw rulesError;
      }

      return {
        job: {
          id: job.id,
          workspaceId: job.workspace_id,
          status: job.status,
          total: job.total_count,
          completed: job.completed_count,
          failed: job.failed_count,
        },
        items: buildAnalysisWorkItems({
          claims: claims.map((claim) => ({
            itemId: claim.item_id,
            rawCommentId: claim.raw_comment_id,
            workspaceId: claim.workspace_id,
          })),
          rawComments: allRawComments.map((comment) => ({
            id: comment.id,
            workspaceId: comment.workspace_id,
            youtubeVideoId: comment.youtube_video_id,
            parentRawCommentId: comment.parent_youtube_comment_id
              ? (rawIdByYouTubeId.get(comment.parent_youtube_comment_id) ??
                null)
              : null,
            textDisplay: comment.text_display,
            textOriginal: comment.text_original,
          })),
          videos: (videos ?? []).map((video) => ({
            youtubeVideoId: video.youtube_video_id,
            title: video.title,
          })),
          policy: {
            version: policy.version,
            categorySensitivity: policy.category_sensitivity,
            preferredActions: policy.preferred_actions,
            harmfulTextHidden: policy.harmful_text_hidden,
          },
          rules: (rules ?? []).map((rule) => ({
            id: rule.id,
            kind: rule.kind,
            phrase: rule.phrase,
            normalizedPhrase: rule.normalized_phrase,
            contextNote: rule.context_note,
            enabled: rule.enabled,
            version: rule.version,
          })),
        }),
      };
    },
    async insertRuleEvaluation({ evaluation, item }) {
      const row = {
        workspace_id: item.workspaceId,
        raw_comment_id: item.rawCommentId,
        policy_version: item.policy.version,
        rule_engine_version: evaluation.engineVersion,
        normalized_text: evaluation.normalizedText,
        signals: evaluation.signals as Json,
        initial_review_level: evaluation.initialReviewLevel,
      };
      const { data, error } = await admin
        .from("rule_evaluations")
        .insert(row)
        .select("id")
        .single();

      if (!error && data) {
        return data.id;
      }
      if (!isUniqueViolation(error)) {
        throw error ?? new Error("Rule evaluation was not stored");
      }

      const { data: existing, error: existingError } = await admin
        .from("rule_evaluations")
        .select("id")
        .eq("raw_comment_id", item.rawCommentId)
        .eq("rule_engine_version", evaluation.engineVersion)
        .eq("policy_version", item.policy.version)
        .single();
      if (existingError) throw existingError;
      return existing.id;
    },
    async insertModelRun(input) {
      const row = {
        workspace_id: input.item.workspaceId,
        raw_comment_id: input.item.rawCommentId,
        analysis_job_item_id: input.item.id,
        stage: input.stage,
        provider: input.result.provider,
        model_identifier: input.result.modelIdentifier,
        provider_response_id: input.result.providerResponseId,
        idempotency_key: input.idempotencyKey,
        prompt_version: input.promptVersion,
        schema_version: input.schemaVersion,
        policy_version: input.policyVersion,
        latency_ms: input.result.latencyMs,
        usage: input.result.usage as Json,
        status: "succeeded",
      };
      const { data, error } = await admin
        .from("model_runs")
        .insert(row)
        .select("id")
        .single();

      if (!error && data) {
        return data.id;
      }
      if (!isUniqueViolation(error)) {
        throw error ?? new Error("Model run was not stored");
      }

      const { data: existing, error: existingError } = await admin
        .from("model_runs")
        .select("id")
        .eq("idempotency_key", input.idempotencyKey)
        .single();
      if (existingError) throw existingError;
      return existing.id;
    },
    async insertFailedModelRun(input) {
      const { error } = await admin.from("model_runs").insert({
        workspace_id: input.item.workspaceId,
        raw_comment_id: input.item.rawCommentId,
        analysis_job_item_id: input.item.id,
        stage: input.stage,
        provider: "openai",
        model_identifier: environment.OPENAI_ANALYSIS_MODEL,
        idempotency_key: input.idempotencyKey,
        prompt_version: input.promptVersion,
        schema_version: input.schemaVersion,
        policy_version: input.policyVersion,
        usage: {},
        status: "failed",
        error_code: input.errorCode,
      });

      if (error && !isUniqueViolation(error)) {
        throw error;
      }
    },
    async insertAnalysis(input) {
      const row = {
        workspace_id: input.item.workspaceId,
        raw_comment_id: input.item.rawCommentId,
        analysis_job_item_id: input.item.id,
        model_run_id: input.modelRunId,
        rule_evaluation_id: input.ruleEvaluationId,
        stage: input.stage,
        category: input.category,
        confidence: input.confidence,
        review_level: input.reviewLevel,
        toxicity: input.toxicity,
        spam: input.spam,
        phishing: input.phishing,
        actionable_feedback: input.actionableFeedback,
        recommended_action: input.recommendedAction,
        manual_review: input.manualReview,
        evidence_review: input.evidenceReview,
        explanation: input.explanation,
        policy_version: input.policyVersion,
        retrieved_feedback: [],
        provenance: input.provenance as Json,
      };
      const { data, error } = await admin
        .from("comment_analyses")
        .insert(row)
        .select("id")
        .single();

      if (!error && data) {
        return data.id;
      }
      if (!isUniqueViolation(error)) {
        throw error ?? new Error("Comment analysis was not stored");
      }

      const { data: existing, error: existingError } = await admin
        .from("comment_analyses")
        .select("id")
        .eq("model_run_id", input.modelRunId)
        .single();
      if (existingError) throw existingError;
      return existing.id;
    },
    async insertStageTwoAnalysis(input) {
      const { data, error } = await admin
        .from("comment_analyses")
        .insert(toStageTwoAnalysisRow(input))
        .select("id")
        .single();

      if (!error && data) {
        return data.id;
      }
      if (!isUniqueViolation(error)) {
        throw error ?? new Error("Stage-two analysis was not stored");
      }

      const { data: existing, error: existingError } = await admin
        .from("comment_analyses")
        .select("id")
        .eq("model_run_id", input.modelRunId)
        .single();
      if (existingError) throw existingError;
      return existing.id;
    },
    async insertSanitizedFeedback(input) {
      const { error } = await admin
        .from("sanitized_feedback")
        .insert(toSanitizedFeedbackRow(input));

      if (error && !isUniqueViolation(error)) {
        throw error;
      }
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
    async failItem(itemId, errorCode) {
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
      const { data: items, error: itemsError } = await admin
        .from("analysis_job_items")
        .select("status")
        .eq("analysis_job_id", targetJobId);

      if (itemsError || !items) {
        throw itemsError ?? new Error("Analysis job items were not loaded");
      }

      const total = items.length;
      const completed = items.filter(
        (item) => item.status === "succeeded",
      ).length;
      const failed = items.filter((item) => item.status === "failed").length;
      const remaining = Math.max(total - completed - failed, 0);
      const status =
        remaining > 0
          ? "running"
          : completed === total
            ? "succeeded"
            : completed > 0
              ? "partially_succeeded"
              : "failed";
      const terminal = remaining === 0;
      const { error: updateError } = await admin
        .from("analysis_jobs")
        .update({
          status,
          total_count: total,
          completed_count: completed,
          failed_count: failed,
          finished_at: terminal ? new Date().toISOString() : null,
        })
        .eq("id", targetJobId);

      if (updateError) {
        throw updateError;
      }

      return { status, total, completed, failed, remaining };
    },
  };

  return createAnalysisService({
    provider,
    repository,
    modelVersion: environment.OPENAI_ANALYSIS_MODEL,
    retrieveCreatorExamples: (input) =>
      ragService.retrieveCreatorExamples(input),
  }).processAnalysisChunk(jobId, maxItems);
};
