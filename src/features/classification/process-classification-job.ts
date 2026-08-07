import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

import type { BranchOutcome } from "./branch";
import {
  createClassificationService,
  type ClassificationJobRepository,
  type ClassificationWorkItem,
  type StoredClassificationState,
  type StoredFinalVerdict,
  type StoredTerraResult,
} from "./classification-service";
import { buildClassificationWorkItems } from "./classification-work-item";
import type { FirstPassResult, ModelRun } from "./contracts";
import { createFirstPass, createSecondPass } from "./openai-clients";
import {
  LunaFirstPassSchema,
  ModerationResultSchema,
  TerraVerdictSchema,
  type FeedbackType,
  type ReasonCode,
} from "./schemas";
import {
  toBranchRow,
  toStageRunRow,
  toVerdictRow,
  type ClassificationStage,
} from "./storage";

type StageRunRow = {
  stage: string;
  model_identifier: string;
  provider_response_id: string | null;
  prompt_version: string | null;
  latency_ms: number | null;
  usage: Json;
  status: string;
  output: Json;
  created_at: string;
};

const toModelRun = (row: StageRunRow): ModelRun => {
  const usage =
    typeof row.usage === "object" && row.usage && !Array.isArray(row.usage)
      ? row.usage
      : {};
  const numberValue = (key: string) => {
    const value = usage[key];
    return typeof value === "number" ? value : 0;
  };

  return {
    model: row.model_identifier,
    responseId: row.provider_response_id ?? "",
    latencyMs: row.latency_ms ?? 0,
    usage: {
      inputTokens: numberValue("inputTokens"),
      outputTokens: numberValue("outputTokens"),
      totalTokens: numberValue("totalTokens"),
    },
  };
};

const decodeBranch = (row: {
  outcome: string;
  reasons: Json;
  protection: Json;
} | null): BranchOutcome | null => {
  if (!row) return null;
  if (row.outcome === "instant_safe") {
    return {
      kind: "instant_safe",
      level: "safe",
      basis: "luna_safe",
      certainty: "clear",
    };
  }

  const protection =
    typeof row.protection === "object" &&
    row.protection &&
    !Array.isArray(row.protection)
      ? row.protection
      : {};
  return {
    kind: "verify",
    reasons: (Array.isArray(row.reasons) ? row.reasons : []) as Extract<
      BranchOutcome,
      { kind: "verify" }
    >["reasons"],
    protection: {
      hideSourceBeforeVerdict: protection.hideSourceBeforeVerdict === true,
      moderationMinimumLevel:
        protection.moderationMinimumLevel === "safe" ||
        protection.moderationMinimumLevel === "caution" ||
        protection.moderationMinimumLevel === "danger"
          ? protection.moderationMinimumLevel
          : null,
      maySignalSelfHarmCase: protection.maySignalSelfHarmCase === true,
    },
  };
};

const decodeState = ({
  branch,
  runs,
  verdict,
}: {
  runs: StageRunRow[];
  branch: {
    outcome: string;
    reasons: Json;
    protection: Json;
  } | null;
  verdict: {
    status: string;
    level: "safe" | "caution" | "risk" | null;
    basis: string;
    agreed_with_first_pass: boolean | null;
    allow_rewrite: boolean;
    hide_source: boolean;
    recommended_actions: Json;
    reason_codes: Json;
    feedback_type: string;
    feedback_core: string | null;
    safety_case: boolean;
    raised_by_moderation: boolean;
  } | null;
}): StoredClassificationState => {
  const lunaRow = runs.find(
    (run) => run.stage === "luna" && run.status === "succeeded",
  );
  const moderationRow = runs.find(
    (run) => run.stage === "moderation" && run.status === "succeeded",
  );
  const terraRow = runs.find(
    (run) => run.stage === "terra" && run.status === "succeeded",
  );

  let firstPass: FirstPassResult | null = null;
  if (lunaRow) {
    const luna = LunaFirstPassSchema.safeParse(lunaRow.output);
    const moderation = moderationRow
      ? ModerationResultSchema.safeParse(moderationRow.output)
      : null;
    if (luna.success) {
      firstPass = {
        commentId: "",
        workspaceId: "",
        moderation:
          moderation?.success
            ? {
                result: moderation.data,
                model: moderationRow?.model_identifier ?? "",
                latencyMs: moderationRow?.latency_ms ?? 0,
              }
            : null,
        luna: { result: luna.data, run: toModelRun(lunaRow) },
        promptVersion: lunaRow.prompt_version ?? "luna-v1",
        evaluatedAt: lunaRow.created_at,
      };
    }
  }

  let terra: StoredTerraResult | null = null;
  if (terraRow) {
    const parsed = TerraVerdictSchema.safeParse(terraRow.output);
    if (parsed.success) {
      terra = {
        result: parsed.data,
        run: toModelRun(terraRow),
        promptVersion: terraRow.prompt_version ?? "terra-v1",
      };
    }
  }

  let storedVerdict: StoredFinalVerdict | null = null;
  if (verdict) {
    storedVerdict = {
      verdict: {
        status: verdict.status === "review_queue" ? "review_queue" : "decided",
        level: verdict.level === "risk" ? "danger" : verdict.level,
        basis: verdict.basis as StoredFinalVerdict["verdict"]["basis"],
        agreedWithFirstPass: verdict.agreed_with_first_pass,
        allowRewrite: verdict.allow_rewrite,
        hideSource: verdict.hide_source,
        recommendedActions: (Array.isArray(verdict.recommended_actions)
          ? verdict.recommended_actions
          : []) as StoredFinalVerdict["verdict"]["recommendedActions"],
        safetyCase: verdict.safety_case,
        raisedByModeration: verdict.raised_by_moderation,
      },
      reasonCodes: (Array.isArray(verdict.reason_codes)
        ? verdict.reason_codes
        : []) as ReasonCode[],
      feedbackType: verdict.feedback_type as FeedbackType,
      feedbackCore: verdict.feedback_core,
    };
  }

  return {
    firstPass,
    branch: decodeBranch(branch),
    terra,
    verdict: storedVerdict,
  };
};

const stageKey = (
  item: ClassificationWorkItem,
  stage: ClassificationStage,
  model: string,
  promptVersion: string | null,
) =>
  [item.id, stage, model, promptVersion ?? "no-prompt", "classification-v1"].join(
    ":",
  );

export const processClassificationChunk = async (
  jobId: string,
  maxItems = 5,
) => {
  const admin = createAdminSupabaseClient();
  const repository: ClassificationJobRepository = {
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
        .select("id, workspace_id, youtube_video_id, text_display")
        .eq("workspace_id", workspaceId)
        .in("id", rawIds);
      if (rawError || !rawComments) throw rawError ?? new Error("raw_missing");

      const videoIds = [...new Set(rawComments.map((row) => row.youtube_video_id))];
      const [{ data: videos, error: videoError }, { data: policy, error: policyError }] =
        await Promise.all([
          admin
            .from("youtube_videos")
            .select("youtube_video_id, youtube_channel_id, title")
            .eq("workspace_id", workspaceId)
            .in("youtube_video_id", videoIds),
          admin
            .from("creator_policies")
            .select("version")
            .eq("workspace_id", workspaceId)
            .order("version", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
      if (videoError || policyError || !videos?.length) {
        throw videoError ?? policyError ?? new Error("video_missing");
      }

      return buildClassificationWorkItems({
        claims: claims.map((claim) => ({
          itemId: claim.item_id,
          rawCommentId: claim.raw_comment_id,
          workspaceId: claim.workspace_id,
        })),
        rawComments: rawComments.map((row) => ({
          id: row.id,
          workspaceId: row.workspace_id,
          youtubeVideoId: row.youtube_video_id,
          textDisplay: row.text_display,
        })),
        videos: videos.map((video) => ({
          youtubeVideoId: video.youtube_video_id,
          title: video.title,
        })),
        channelId: videos[0].youtube_channel_id,
        policyVersion: policy?.version ?? 1,
      });
    },
    async loadState(item) {
      const [runsResult, branchResult, verdictResult] = await Promise.all([
        admin
          .from("classification_stage_runs")
          .select(
            "stage, model_identifier, provider_response_id, prompt_version, latency_ms, usage, status, output, created_at",
          )
          .eq("analysis_job_item_id", item.id),
        admin
          .from("classification_branches")
          .select("outcome, reasons, protection")
          .eq("analysis_job_item_id", item.id)
          .maybeSingle(),
        admin
          .from("classification_verdicts")
          .select(
            "status, level, basis, agreed_with_first_pass, allow_rewrite, hide_source, recommended_actions, reason_codes, feedback_type, feedback_core, safety_case, raised_by_moderation",
          )
          .eq("analysis_job_item_id", item.id)
          .maybeSingle(),
      ]);
      if (runsResult.error || branchResult.error || verdictResult.error) {
        throw runsResult.error ?? branchResult.error ?? verdictResult.error;
      }
      const state = decodeState({
        runs: runsResult.data ?? [],
        branch: branchResult.data,
        verdict: verdictResult.data,
      });
      if (state.firstPass) {
        state.firstPass.commentId = item.rawCommentId;
        state.firstPass.workspaceId = item.workspaceId;
      }
      return state;
    },
    async saveFirstPass(item, result) {
      const rows = [];
      if (result.moderation) {
        rows.push(
          toStageRunRow({
            item,
            stage: "moderation",
            provider: "openai",
            modelIdentifier: result.moderation.model,
            providerResponseId: null,
            idempotencyKey: stageKey(
              item,
              "moderation",
              result.moderation.model,
              null,
            ),
            promptVersion: null,
            schemaVersion: "classification-v1",
            policyVersion: item.policyVersion,
            latencyMs: result.moderation.latencyMs,
            usage: {},
            status: "succeeded",
            output: result.moderation.result as unknown as Json,
            errorCode: null,
          }),
        );
      } else {
        rows.push(
          toStageRunRow({
            item,
            stage: "moderation",
            provider: "openai",
            modelIdentifier: "omni-moderation-latest",
            providerResponseId: null,
            idempotencyKey: stageKey(
              item,
              "moderation",
              "omni-moderation-latest",
              null,
            ),
            promptVersion: null,
            schemaVersion: "classification-v1",
            policyVersion: item.policyVersion,
            latencyMs: null,
            usage: {},
            status: "failed",
            output: {},
            errorCode: "moderation_unavailable",
          }),
        );
      }
      rows.push(
        toStageRunRow({
          item,
          stage: "luna",
          provider: "openai",
          modelIdentifier: result.luna.run.model,
          providerResponseId: result.luna.run.responseId,
          idempotencyKey: stageKey(
            item,
            "luna",
            result.luna.run.model,
            result.promptVersion,
          ),
          promptVersion: result.promptVersion,
          schemaVersion: "classification-v1",
          policyVersion: item.policyVersion,
          latencyMs: result.luna.run.latencyMs,
          usage: result.luna.run.usage as unknown as Json,
          status: "succeeded",
          output: result.luna.result as unknown as Json,
          errorCode: null,
        }),
      );
      const { error } = await admin
        .from("classification_stage_runs")
        .upsert(rows, { onConflict: "analysis_job_item_id,stage" });
      if (error) throw error;
    },
    async saveBranch(item, branch) {
      const { error } = await admin
        .from("classification_branches")
        .upsert(toBranchRow({ item, branch }), {
          onConflict: "analysis_job_item_id",
        });
      if (error) throw error;
    },
    async saveTerra(item, result) {
      const row = toStageRunRow({
        item,
        stage: "terra",
        provider: "openai",
        modelIdentifier: result.run.model,
        providerResponseId: result.run.responseId,
        idempotencyKey: stageKey(
          item,
          "terra",
          result.run.model,
          result.promptVersion,
        ),
        promptVersion: result.promptVersion,
        schemaVersion: "classification-v1",
        policyVersion: item.policyVersion,
        latencyMs: result.run.latencyMs,
        usage: result.run.usage as unknown as Json,
        status: "succeeded",
        output: result.result as unknown as Json,
        errorCode: null,
      });
      const { error } = await admin
        .from("classification_stage_runs")
        .upsert(row, { onConflict: "analysis_job_item_id,stage" });
      if (error) throw error;
    },
    async saveVerdict(item, result) {
      const { error } = await admin
        .from("classification_verdicts")
        .upsert(toVerdictRow({ item, ...result }), {
          onConflict: "analysis_job_item_id",
        });
      if (error) throw error;
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
      const { data: items, error } = await admin
        .from("analysis_job_items")
        .select("status")
        .eq("analysis_job_id", targetJobId);
      if (error || !items) throw error ?? new Error("items_missing");
      const total = items.length;
      const completed = items.filter((row) => row.status === "succeeded").length;
      const failed = items.filter((row) => row.status === "failed").length;
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

  return createClassificationService({
    firstPass: createFirstPass(),
    secondPass: createSecondPass(),
    repository,
  }).processChunk(jobId, Math.min(Math.max(maxItems, 1), 5));
};
