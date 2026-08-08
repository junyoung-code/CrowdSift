import "server-only";

import { requireViewer } from "@/features/auth/require-viewer";
import { createClassificationConfigurationKey } from "@/features/classification/configuration";
import {
  processClassificationChunk,
} from "@/features/classification/process-classification-job";
import type { ClassificationJobProgress } from "@/features/classification/classification-service";
import { createYouTubeProvider } from "@/features/youtube/provider-factory";
import { getServerEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

import { collectChannelCommentPage } from "./channel-comment-page-collector";
import {
  createChannelCommentSyncService,
  type ChannelSyncBatchResult,
  type ChannelSyncClaim,
  type ChannelSyncRepository,
} from "./channel-comment-sync-service";
import {
  ChannelSyncProcessingError,
  toChannelSyncProcessingError,
} from "./import-errors";

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;
type ClassificationProgress = ClassificationJobProgress;

const LEASE_SECONDS = 240;
const nullableText = (value: string | null): string => value as string;

const assertWorkspaceViewer = async (workspaceId: string) => {
  const viewer = await requireViewer();
  if (viewer.workspaceId !== workspaceId) {
    throw new Error("channel_sync_workspace_mismatch");
  }
  return viewer;
};

const toClaim = (row: {
  setting_id: string;
  run_id: string;
  claim_token: string;
  workspace_id: string;
  connection_id: string;
  youtube_channel_id: string;
  run_kind: string;
  backfill_start_at: string;
  page_token: string | null;
  last_successful_sync_at: string | null;
  incremental_scan_started_at: string | null;
}): ChannelSyncClaim => {
  if (
    row.run_kind !== "backfill_recent" &&
    row.run_kind !== "incremental" &&
    row.run_kind !== "reply_reconciliation"
  ) {
    throw new ChannelSyncProcessingError("unsupported_sync_kind");
  }

  return {
    settingId: row.setting_id,
    runId: row.run_id,
    claimToken: row.claim_token,
    workspaceId: row.workspace_id,
    connectionId: row.connection_id,
    youtubeChannelId: row.youtube_channel_id,
    runKind: row.run_kind,
    backfillStartAt: row.backfill_start_at,
    pageToken: row.page_token,
    lastSuccessfulSyncAt: row.last_successful_sync_at,
    incrementalScanStartedAt: row.incremental_scan_started_at,
  };
};

const claimOne = async ({
  admin,
  workspaceId,
}: {
  admin: AdminClient;
  workspaceId?: string;
}): Promise<ChannelSyncClaim | null> => {
  const result = workspaceId
    ? await (async () => {
        const viewer = await assertWorkspaceViewer(workspaceId);
        return admin.rpc("claim_channel_comment_sync_work_for_workspace", {
          target_workspace_id: workspaceId,
          target_requesting_user_id: viewer.userId,
          target_lease_seconds: LEASE_SECONDS,
        });
      })()
    : await admin.rpc("claim_channel_comment_sync_work", {
        target_limit: 1,
        target_lease_seconds: LEASE_SECONDS,
      });

  if (result.error) throw result.error;
  const row = result.data?.[0];
  return row ? toClaim(row) : null;
};

const createRepository = (
  admin: AdminClient,
): ChannelSyncRepository => ({
  async upsertVideoMetadata({ video, workspaceId, youtubeChannelId }) {
    const { error } = await admin.from("youtube_videos").upsert(
      {
        workspace_id: workspaceId,
        youtube_channel_id: youtubeChannelId,
        youtube_video_id: video.id,
        title: video.title,
        thumbnail_url: video.thumbnailUrl,
        published_at: video.publishedAt,
        captured_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,youtube_video_id" },
    );
    if (error) throw error;
  },

  async createOrGetVideoImportJob(input) {
    const findExisting = () =>
      admin
        .from("comment_import_jobs")
        .select("id")
        .eq("workspace_id", input.workspaceId)
        .eq("channel_sync_run_id", input.runId)
        .eq("youtube_video_id", input.youtubeVideoId)
        .eq("trigger_kind", "channel_sync")
        .maybeSingle();
    const existing = await findExisting();
    if (existing.error) throw existing.error;
    if (existing.data) return existing.data;

    const { data, error } = await admin
      .from("comment_import_jobs")
      .insert({
        workspace_id: input.workspaceId,
        youtube_video_id: input.youtubeVideoId,
        requested_top_level_count: null,
        requested_total_count: null,
        source_kind: "owned_oauth",
        source_video_url: null,
        provider_mode: input.providerMode,
        channel_sync_run_id: input.runId,
        trigger_kind: "channel_sync",
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error?.code === "23505") {
      const raced = await findExisting();
      if (raced.error || !raced.data) {
        throw raced.error ?? error;
      }
      return raced.data;
    }
    if (error || !data) {
      throw error ?? new Error("channel_video_import_job_missing");
    }
    return data;
  },

  async storeComment({
    comment,
    importJobId,
    workspaceId,
    youtubeVideoId,
  }) {
    const { data, error } = await admin.rpc("store_import_comment_item", {
      target_import_job_id: importJobId,
      target_workspace_id: workspaceId,
      target_youtube_video_id: youtubeVideoId,
      target_youtube_comment_id: comment.youtubeCommentId,
      target_parent_youtube_comment_id: nullableText(
        comment.parentYoutubeCommentId,
      ),
      target_author_channel_id: nullableText(comment.authorChannelId),
      target_author_display_name: nullableText(comment.authorDisplayName),
      target_author_avatar_url: nullableText(comment.authorAvatarUrl),
      target_text_display: comment.textDisplay,
      target_text_original: nullableText(comment.textOriginal),
      target_like_count: comment.likeCount,
      target_source_moderation_status: nullableText(
        comment.sourceModerationStatus,
      ),
      target_published_at: nullableText(comment.publishedAt),
      target_updated_at: nullableText(comment.updatedAt),
      target_payload: comment.rawPayload as Json,
    });
    const stored = data?.[0];
    if (
      error ||
      !stored ||
      (stored.disposition !== "stored" &&
        stored.disposition !== "updated" &&
        stored.disposition !== "duplicate")
    ) {
      throw error ?? new Error("channel_comment_source_not_stored");
    }
    return {
      disposition: stored.disposition,
      rawCommentId: stored.raw_comment_id,
    };
  },

  async recordFailedItem(input) {
    const { error } = await admin.from("comment_import_items").upsert(
      {
        import_job_id: input.importJobId,
        workspace_id: input.workspaceId,
        youtube_comment_id: input.youtubeCommentId,
        status: "failed",
        error_code: input.errorCode,
      },
      { onConflict: "import_job_id,youtube_comment_id" },
    );
    if (error) throw error;
  },

  async completeVideoImportJob(input) {
    const { error } = await admin
      .from("comment_import_jobs")
      .update({
        status: input.status,
        fetched_count: input.observedCount,
        stored_count: input.storedCount,
        updated_count: input.updatedCount,
        duplicate_count: input.duplicateCount,
        failed_count: input.failedCount,
        top_level_count: input.topLevelCount,
        reply_count: input.replyCount,
        next_page_token: null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", input.importJobId)
      .eq("trigger_kind", "channel_sync");
    if (error) throw error;
  },

  async ensureAnalysisJob({
    configurationKey,
    importJobId,
    rawCommentIds,
    workspaceId,
  }) {
    if (rawCommentIds.length === 0) return null;
    const { data: analysisJob, error: analysisJobError } = await admin
      .from("analysis_jobs")
      .upsert(
        {
          workspace_id: workspaceId,
          import_job_id: importJobId,
          configuration_key: configurationKey,
          status: "pending",
          total_count: rawCommentIds.length,
        },
        { onConflict: "import_job_id,configuration_key" },
      )
      .select("id")
      .single();
    if (analysisJobError || !analysisJob) {
      throw analysisJobError ?? new Error("channel_analysis_job_missing");
    }

    const { error: itemError } = await admin.from("analysis_job_items").upsert(
      rawCommentIds.map((rawCommentId) => ({
        analysis_job_id: analysisJob.id,
        workspace_id: workspaceId,
        raw_comment_id: rawCommentId,
        status: "pending" as const,
      })),
      { onConflict: "analysis_job_id,raw_comment_id", ignoreDuplicates: true },
    );
    if (itemError) throw itemError;
    return analysisJob;
  },

  async completeRun(input) {
    const { error } = await admin.rpc("complete_channel_comment_sync_run", {
      target_run_id: input.runId,
      target_claim_token: input.claimToken,
      target_next_page_token: input.nextPageToken,
      target_reached_boundary: input.reachedBoundary,
      target_observed_count: input.observedCount,
      target_stored_count: input.storedCount,
      target_updated_count: input.updatedCount,
      target_duplicate_count: input.duplicateCount,
      target_failed_count: input.failedCount,
      target_analyzed_count: input.analyzedCount,
      target_quota_units_used: input.quotaUnitsUsed,
      target_reply_cursor: null,
    });
    if (error) throw error;
  },

  async failRun(input) {
    const { error } = await admin.rpc("fail_channel_comment_sync_run", {
      target_run_id: input.runId,
      target_claim_token: input.claimToken,
      target_error_code: input.errorCode,
    });
    if (error) throw error;
  },
});

const failClaim = async (
  admin: AdminClient,
  claim: ChannelSyncClaim,
  error: unknown,
) => {
  const processingError = toChannelSyncProcessingError(error);
  const { error: failError } = await admin.rpc(
    "fail_channel_comment_sync_run",
    {
      target_run_id: claim.runId,
      target_claim_token: claim.claimToken,
      target_error_code: processingError.code,
    },
  );
  if (failError) throw failError;
  throw processingError;
};

export async function processOneChannelSyncWork(input: {
  workspaceId?: string;
}): Promise<ChannelSyncBatchResult | null> {
  const admin = createAdminSupabaseClient();
  const claim = await claimOne({ admin, workspaceId: input.workspaceId });
  if (!claim) return null;

  let policyVersion: number;
  try {
    const [connectionResult, policyResult] = await Promise.all([
      admin
        .from("youtube_connections")
        .select("id, status")
        .eq("id", claim.connectionId)
        .eq("workspace_id", claim.workspaceId)
        .maybeSingle(),
      admin
        .from("creator_policies")
        .select("version")
        .eq("workspace_id", claim.workspaceId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (connectionResult.error || policyResult.error) {
      throw connectionResult.error ?? policyResult.error;
    }
    if (!connectionResult.data || connectionResult.data.status !== "connected") {
      throw new ChannelSyncProcessingError("permission_revoked");
    }
    policyVersion = policyResult.data?.version ?? 1;
  } catch (error) {
    return failClaim(admin, claim, error);
  }

  const environment = getServerEnv();
  const provider = createYouTubeProvider();
  const repository = createRepository(admin);
  const analysisConfigurationKey = createClassificationConfigurationKey({
    policyVersion,
    providerMode: environment.EXTERNAL_PROVIDER_MODE,
    moderationModel: environment.OPENAI_MODERATION_MODEL,
    lunaModel: environment.OPENAI_LUNA_MODEL,
    terraModel: environment.OPENAI_TERRA_MODEL,
  });

  return createChannelCommentSyncService({
    repository,
    providerMode: environment.EXTERNAL_PROVIDER_MODE,
    analysisConfigurationKey,
    source: {
      collectPage: (collectionInput) =>
        collectChannelCommentPage({
          ...collectionInput,
          provider,
        }),
      listVideosByIds: (videoIds) => provider.listVideosByIds(videoIds),
    },
  }).process(claim);
}

export async function processPendingChannelClassification(input: {
  workspaceId?: string;
  maxItems: number;
}): Promise<ClassificationProgress | null> {
  if (!Number.isInteger(input.maxItems) || input.maxItems < 1 || input.maxItems > 5) {
    throw new Error("channel_classification_batch_out_of_range");
  }
  if (input.workspaceId) {
    await assertWorkspaceViewer(input.workspaceId);
  }

  const admin = createAdminSupabaseClient();
  let query = admin
    .from("analysis_jobs")
    .select("id, workspace_id, comment_import_jobs!inner(trigger_kind)")
    .eq("comment_import_jobs.trigger_kind", "channel_sync")
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: true })
    .limit(1);
  if (input.workspaceId) {
    query = query.eq("workspace_id", input.workspaceId);
  }
  const { data: analysisJob, error } = await query.maybeSingle();
  if (error) throw error;
  if (!analysisJob) return null;

  return processClassificationChunk(analysisJob.id, input.maxItems);
}
