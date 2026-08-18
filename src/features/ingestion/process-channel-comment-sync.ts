import "server-only";

import { requireViewer } from "@/features/auth/require-viewer";
import { createClassificationConfigurationKey } from "@/features/classification/configuration";
import {
  processClassificationChunk,
} from "@/features/classification/process-classification-job";
import type { ClassificationJobProgress } from "@/features/classification/classification-service";
import {
  isUsableOwnerConnection,
  markOwnerConnectionRevoked,
  openOwnerConnection,
  OWNER_CONNECTION_COLUMNS,
  type OwnerConnectionRow,
} from "@/features/youtube/owner-connection";
import { getServerEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

import { collectChannelCommentPage } from "./channel-comment-page-collector";
import {
  createChannelCommentSyncService,
  type ChannelSyncBatchResult,
  type ChannelSyncClaim,
  type ChannelSyncRepository,
  type ChannelSyncVideoImportJob,
  type CompleteChannelSyncRunInput,
  type CompleteChannelVideoImportInput,
} from "./channel-comment-sync-service";
import {
  ChannelSyncProcessingError,
  toChannelSyncProcessingError,
} from "./import-errors";
import {
  createReplyReconciliationService,
  type ReplyCursor,
  type ReplyReconciliationBatchResult,
  type ReplyReconciliationParent,
  type ReplyReconciliationRepository,
} from "./reply-reconciliation-service";

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;
type ClassificationProgress = ClassificationJobProgress;

const LEASE_SECONDS = 240;
const nullableText = (value: string | null): string => value as string;

type ChannelSyncConfigurationInput = {
  policyVersion: number;
  providerMode: "live" | "fixture";
  moderationModel: string;
  lunaModel: string;
  terraModel: string;
};

export const createChannelSyncAnalysisConfigurationKey = (
  input: ChannelSyncConfigurationInput,
) => createClassificationConfigurationKey(input);

export const buildCreateChannelSyncVideoImportRpcArgs = (input: {
  runId: string;
  claimToken: string;
  workspaceId: string;
  youtubeVideoId: string;
  providerMode: "live" | "fixture";
}) => ({
  target_run_id: input.runId,
  target_claim_token: input.claimToken,
  target_workspace_id: input.workspaceId,
  target_youtube_video_id: input.youtubeVideoId,
  target_provider_mode: input.providerMode,
});

export const buildStoreChannelSyncCommentRpcArgs = (
  input: Parameters<ChannelSyncRepository["storeComment"]>[0],
) => ({
  target_import_job_id: input.importJobId,
  target_run_id: input.runId,
  target_claim_token: input.claimToken,
  target_workspace_id: input.workspaceId,
  target_youtube_video_id: input.youtubeVideoId,
  target_youtube_comment_id: input.comment.youtubeCommentId,
  target_parent_youtube_comment_id: nullableText(
    input.comment.parentYoutubeCommentId,
  ),
  target_author_channel_id: nullableText(input.comment.authorChannelId),
  target_author_display_name: nullableText(input.comment.authorDisplayName),
  target_author_avatar_url: nullableText(input.comment.authorAvatarUrl),
  target_text_display: input.comment.textDisplay,
  target_text_original: nullableText(input.comment.textOriginal),
  target_like_count: input.comment.likeCount,
  target_source_moderation_status: nullableText(
    input.comment.sourceModerationStatus,
  ),
  target_published_at: nullableText(input.comment.publishedAt),
  target_updated_at: nullableText(input.comment.updatedAt),
  target_payload: input.comment.rawPayload as Json,
});

export const buildRecordChannelSyncItemFailureRpcArgs = (input: {
  importJobId: string;
  runId: string;
  claimToken: string;
  workspaceId: string;
  youtubeCommentId: string;
  errorCode: string;
}) => ({
  target_import_job_id: input.importJobId,
  target_run_id: input.runId,
  target_claim_token: input.claimToken,
  target_workspace_id: input.workspaceId,
  target_youtube_comment_id: input.youtubeCommentId,
  target_error_code: input.errorCode,
});

export const buildCompleteChannelSyncRunRpcArgs = (
  input: CompleteChannelSyncRunInput,
) => ({
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

export const buildCompleteReplyReconciliationRunRpcArgs = (
  input: Parameters<ReplyReconciliationRepository["completeRun"]>[0],
) => ({
  target_run_id: input.runId,
  target_claim_token: input.claimToken,
  target_next_page_token: null,
  target_reached_boundary: false,
  target_observed_count: input.observedCount,
  target_stored_count: input.storedCount,
  target_updated_count: input.updatedCount,
  target_duplicate_count: input.duplicateCount,
  target_failed_count: input.failedCount,
  target_analyzed_count: input.analyzedCount,
  target_quota_units_used: input.quotaUnitsUsed,
  target_reply_cursor: input.replyCursor,
});

export const buildReplyParentKeysetFilter = (cursor: ReplyCursor) =>
  `published_at.gt.${cursor.publishedAt},and(published_at.eq.${cursor.publishedAt},id.gt.${cursor.id})`;

type ReplyParentRpcRow = {
  id: string;
  youtube_comment_id: string;
  youtube_video_id: string;
  published_at: string;
};

export const toReplyReconciliationParentPage = (
  rows: ReplyParentRpcRow[],
  limit: number,
): {
  items: ReplyReconciliationParent[];
  nextCursor: ReplyCursor | null;
} => {
  const items = rows.slice(0, limit).map((row) => ({
    rawCommentId: row.id,
    youtubeCommentId: row.youtube_comment_id,
    youtubeVideoId: row.youtube_video_id,
    publishedAt: new Date(row.published_at).toISOString(),
  }));
  const lastItem = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && lastItem
        ? { publishedAt: lastItem.publishedAt, id: lastItem.rawCommentId }
        : null,
  };
};

export const buildFinalizeChannelVideoImportRpcArgs = (
  input: CompleteChannelVideoImportInput,
) => ({
  target_import_job_id: input.importJobId,
  target_run_id: input.runId,
  target_claim_token: input.claimToken,
  target_observed_count: input.observedCount,
  target_stored_count: input.storedCount,
  target_updated_count: input.updatedCount,
  target_duplicate_count: input.duplicateCount,
  target_failed_count: input.failedCount,
  target_top_level_count: input.topLevelCount,
  target_reply_count: input.replyCount,
  target_quota_units_used: input.quotaUnitsUsed,
  target_error_code: input.errorCode,
  target_status: input.status,
});

type ChannelSyncVideoImportRpcRow = {
  id: string;
  status: string;
  is_terminal: boolean;
  stored_count: number;
  updated_count: number;
  duplicate_count: number;
  failed_count: number;
  analyzed_count: number;
  quota_units_used: number;
};

export const toChannelSyncVideoImportJob = (
  row: ChannelSyncVideoImportRpcRow,
): ChannelSyncVideoImportJob => {
  if (!row.is_terminal) {
    if (row.status !== "running") {
      throw new Error("channel_video_import_job_invalid_state");
    }
    return {
      id: row.id,
      state: "running",
      analyzedCount: row.analyzed_count,
    };
  }

  if (
    row.status !== "succeeded" &&
    row.status !== "partially_succeeded" &&
    row.status !== "failed"
  ) {
    throw new Error("channel_video_import_job_invalid_state");
  }

  return {
    id: row.id,
    state: "terminal",
    status: row.status,
    storedCount: row.stored_count,
    updatedCount: row.updated_count,
    duplicateCount: row.duplicate_count,
    failedCount: row.failed_count,
    analyzedCount: row.analyzed_count,
    quotaUnitsUsed: row.quota_units_used,
  };
};

export const buildAttachChannelSyncAnalysisItemsRpcArgs = (input: {
  importJobId: string;
  runId: string;
  claimToken: string;
  workspaceId: string;
  youtubeVideoId: string;
  configurationKey: string;
}) => ({
  target_import_job_id: input.importJobId,
  target_run_id: input.runId,
  target_claim_token: input.claimToken,
  target_workspace_id: input.workspaceId,
  target_youtube_video_id: input.youtubeVideoId,
  target_configuration_key: input.configurationKey,
});

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
    const { data, error } = await admin.rpc(
      "create_or_get_channel_sync_video_import_job",
      buildCreateChannelSyncVideoImportRpcArgs(input),
    );
    if (error) {
      if (error.message.includes("provider_mode_mismatch")) {
        throw new ChannelSyncProcessingError("provider_mode_mismatch", {
          cause: error,
        });
      }
      throw error;
    }
    const job = data?.[0];
    if (!job) {
      throw error ?? new Error("channel_video_import_job_missing");
    }
    return toChannelSyncVideoImportJob(job);
  },

  async storeComment(input) {
    const { data, error } = await admin.rpc(
      "store_channel_sync_comment_item",
      buildStoreChannelSyncCommentRpcArgs(input),
    );
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
    const { error } = await admin.rpc(
      "record_channel_sync_import_item_failure",
      buildRecordChannelSyncItemFailureRpcArgs(input),
    );
    if (error) throw error;
  },

  async completeVideoImportJob(input) {
    const { error } = await admin.rpc(
      "finalize_channel_sync_video_import_job_v2",
      buildFinalizeChannelVideoImportRpcArgs(input),
    );
    if (error) throw error;
  },

  async attachRecoverableAnalysisItems(input) {
    const { data, error } = await admin.rpc(
      "attach_channel_sync_analysis_items",
      buildAttachChannelSyncAnalysisItemsRpcArgs(input),
    );
    if (error || !data) {
      throw error ?? new Error("channel_analysis_assignment_missing");
    }
    const first = data[0];
    if (!first) {
      return { analysisJobId: null, attachedRawCommentIds: [] };
    }
    if (data.some((row) => row.analysis_job_id !== first.analysis_job_id)) {
      throw new Error("channel_analysis_assignment_inconsistent");
    }
    return {
      analysisJobId: first.analysis_job_id,
      attachedRawCommentIds: data.map((row) => row.raw_comment_id),
    };
  },

  async completeRun(input) {
    const { error } = await admin.rpc(
      "complete_channel_comment_sync_run",
      buildCompleteChannelSyncRunRpcArgs(input),
    );
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

const REPLY_PARENT_SELECT = `
  id,
  youtube_comment_id,
  youtube_video_id,
  published_at,
  first_import:comment_import_jobs!raw_comments_first_import_job_id_fkey!inner(
    trigger_kind,
    source_kind,
    sync_run:channel_comment_sync_runs!comment_import_jobs_channel_sync_run_id_fkey!inner(
      setting:channel_comment_sync_settings!channel_comment_sync_runs_setting_id_fkey!inner(
        youtube_channel_id
      )
    )
  )
`;

export const createReplyReconciliationRepository = (
  admin: AdminClient,
): ReplyReconciliationRepository => {
  const baseRepository = createRepository(admin);

  return {
    createOrGetVideoImportJob: baseRepository.createOrGetVideoImportJob,
    storeComment: baseRepository.storeComment,
    recordFailedItem: baseRepository.recordFailedItem,
    completeVideoImportJob: baseRepository.completeVideoImportJob,
    attachRecoverableAnalysisItems:
      baseRepository.attachRecoverableAnalysisItems,
    failRun: baseRepository.failRun,

    async listParents(input) {
      let query = admin
        .from("raw_comments")
        .select(REPLY_PARENT_SELECT)
        .eq("workspace_id", input.workspaceId)
        .eq("first_import.trigger_kind", "channel_sync")
        .eq("first_import.source_kind", "owned_oauth")
        .eq(
          "first_import.sync_run.setting.youtube_channel_id",
          input.youtubeChannelId,
        )
        .is("parent_youtube_comment_id", null)
        .gte("published_at", input.publishedAfter)
        .order("published_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(input.limit + 1);

      if (input.cursor) {
        query = query.or(buildReplyParentKeysetFilter(input.cursor));
      }

      const { data, error } = await query;
      if (error) throw error;
      return toReplyReconciliationParentPage(
        (data ?? []) as ReplyParentRpcRow[],
        input.limit,
      );
    },

    async completeRun(input) {
      const { error } = await admin.rpc(
        "complete_channel_comment_sync_run",
        buildCompleteReplyReconciliationRunRpcArgs(input),
      );
      if (error) throw error;
    },
  };
};

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
}): Promise<
  ChannelSyncBatchResult | ReplyReconciliationBatchResult | null
> {
  const admin = createAdminSupabaseClient();
  const claim = await claimOne({ admin, workspaceId: input.workspaceId });
  if (!claim) return null;

  let policyVersion: number;
  let connectionRow: OwnerConnectionRow | null = null;
  try {
    const [connectionResult, policyResult] = await Promise.all([
      admin
        .from("youtube_connections")
        .select(OWNER_CONNECTION_COLUMNS)
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
    if (!isUsableOwnerConnection(connectionResult.data)) {
      throw new ChannelSyncProcessingError("permission_revoked");
    }
    connectionRow = connectionResult.data;
    policyVersion = policyResult.data?.version ?? 1;
  } catch (error) {
    return failClaim(admin, claim, error);
  }

  const environment = getServerEnv();
  /**
   * 채널 댓글도 **소유자로 읽는다.**
   *
   * API 키로 읽으면 게시된 것만 돌아오고 `moderationStatus` 도 실려 오지 않는다.
   * 유튜브가 먼저 잡아 둔 악플이 인박스에 들어오지 못한다는 뜻이라, 유해한 것부터
   * 보여 주겠다는 자동 수집에서 그것이 빠지면 앞뒤가 맞지 않는다.
   */
  const { connectionVersion, provider, tokens } = openOwnerConnection({
    admin,
    connection: connectionRow as OwnerConnectionRow & {
      encrypted_access_token: string;
    },
    encryptionKey: Buffer.from(
      environment.YOUTUBE_TOKEN_ENCRYPTION_KEY,
      "base64",
    ),
    workspaceId: claim.workspaceId,
  });
  const repository = createRepository(admin);
  const analysisConfigurationKey = createChannelSyncAnalysisConfigurationKey({
    policyVersion,
    providerMode: environment.EXTERNAL_PROVIDER_MODE,
    moderationModel: environment.OPENAI_MODERATION_MODEL,
    lunaModel: environment.OPENAI_LUNA_MODEL,
    terraModel: environment.OPENAI_TERRA_MODEL,
  });

  try {
    if (claim.runKind === "reply_reconciliation") {
      return await createReplyReconciliationService({
        repository: createReplyReconciliationRepository(admin),
        providerMode: environment.EXTERNAL_PROVIDER_MODE,
        analysisConfigurationKey,
        source: {
          listReplies: (replyInput) =>
            provider.listReplies({ ...replyInput, tokens }),
        },
      }).process(claim);
    }

    return await createChannelCommentSyncService({
      repository,
      providerMode: environment.EXTERNAL_PROVIDER_MODE,
      analysisConfigurationKey,
      source: {
        collectPage: (collectionInput) =>
          collectChannelCommentPage({
            ...collectionInput,
            provider,
            tokens,
          }),
        listVideosByIds: (videoIds) => provider.listVideosByIds(videoIds),
      },
    }).process(claim);
  } catch (error) {
    const processingError = toChannelSyncProcessingError(error);
    if (processingError.code === "permission_revoked") {
      await markOwnerConnectionRevoked({
        admin,
        connectionId: connectionRow.id,
        connectionUpdatedAt: connectionVersion.currentUpdatedAt,
        workspaceId: claim.workspaceId,
      });
    }
    throw processingError;
  }
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
