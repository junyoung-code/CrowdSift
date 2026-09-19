import "server-only";

import { getServerEnv } from "@/lib/env";
import { withRetry } from "@/lib/retry";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import {
  createPublicYouTubeReadProvider,
} from "@/features/youtube/public-provider-factory";
import {
  PublicYouTubeProviderError,
} from "@/features/youtube/google-public-read-provider";
import {
  publicCommentCountSchema,
} from "@/features/youtube/public-video-url";
import {
  ProviderModeMismatchError,
  assertProviderModeMatchesJob,
  parseProviderMode,
} from "@/features/providers/provider-mode";

import { randomUUID } from "node:crypto";
import { fetchPublicImportBatch, publicImportCursorSchema } from "./public-import-batch";
import { describeClassificationError } from "@/features/classification/failure-details";
import {
  createPublicImportJob,
  type PublicImportJobRecord,
  type PublicImportRepository,
} from "./public-import-service";
import { ImportProcessingError } from "./import-errors";
import { createClassificationConfigurationKey } from "@/features/classification/configuration";

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

const nullableText = (value: string | null): string => value as string;

const createAnalysisConfigurationKey = ({
  policyVersion,
}: {
  policyVersion: number;
}) => {
  const environment = getServerEnv();

  return createClassificationConfigurationKey({
    policyVersion,
    providerMode: environment.EXTERNAL_PROVIDER_MODE,
  });
};

const createPublicImportRepository = (
  admin: AdminClient,
): PublicImportRepository => ({
  async upsertVideo({ video, workspaceId }) {
    const { error } = await admin.from("youtube_videos").upsert(
      {
        workspace_id: workspaceId,
        youtube_channel_id: video.channelId,
        youtube_video_id: video.videoId,
        title: video.title,
        thumbnail_url: video.thumbnailUrl,
        comments_enabled: video.commentsAvailable,
        captured_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,youtube_video_id" },
    );

    if (error) {
      throw error;
    }
  },

  async createJob({ requestedTotalCount, video, workspaceId }) {
    const { data, error } = await admin
      .from("comment_import_jobs")
      .insert({
        workspace_id: workspaceId,
        youtube_video_id: video.videoId,
        requested_top_level_count: null,
        requested_total_count: requestedTotalCount,
        source_kind: "public_url",
        source_video_url: video.canonicalUrl,
        provider_mode: getServerEnv().EXTERNAL_PROVIDER_MODE,
        youtube_quota_units_used: video.quotaUnitsUsed,
        status: "pending",
      })
      .select(
        "id, workspace_id, youtube_video_id, requested_total_count, source_video_url, provider_mode, status, fetched_count, stored_count, duplicate_count, failed_count, top_level_count, reply_count, youtube_quota_units_used",
      )
      .single();

    if (
      error ||
      !data ||
      data.requested_total_count === null ||
      data.source_video_url === null
    ) {
      throw error ?? new Error("Public import job was not created");
    }

    return {
      id: data.id,
      workspaceId: data.workspace_id,
      youtubeVideoId: data.youtube_video_id,
      requestedTotalCount: data.requested_total_count,
      sourceVideoUrl: data.source_video_url,
      providerMode: parseProviderMode(data.provider_mode),
      status: data.status,
      fetchedCount: data.fetched_count,
      storedCount: data.stored_count,
      duplicateCount: data.duplicate_count,
      failedCount: data.failed_count,
      topLevelCount: data.top_level_count,
      replyCount: data.reply_count,
      youtubeQuotaUnitsUsed: data.youtube_quota_units_used,
    };
  },

  async markRunning(jobId) {
    const { error } = await admin
      .from("comment_import_jobs")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        last_error_code: null,
      })
      .eq("id", jobId)
      .eq("source_kind", "public_url");

    if (error) {
      throw error;
    }
  },

  async upsertSource({
    comment,
    jobId,
    workspaceId,
    youtubeVideoId,
  }) {
    const { data, error } = await admin.rpc("store_import_comment_item", {
      target_import_job_id: jobId,
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
    const result = data?.[0];

    /**
     * `updated` 는 성공이다. 이미 있던 댓글의 내용이 달라져 관찰 기록을 새로 남긴
     * 것뿐이다. 공개 읽기로는 유튜브 상태가 오지 않지만 좋아요 수는 바뀌므로 여기도
     * 같은 구멍이 있었다.
     *
     * 공개 경로는 「이미 저장됨」으로 함께 센다. 이 화면에서 갈라 보여 줄 이유가 아직
     * 없고, 어느 쪽이든 새로 저장된 댓글이 아닌 것은 맞다.
     */
    if (
      error ||
      !result ||
      (result.disposition !== "stored" &&
        result.disposition !== "updated" &&
        result.disposition !== "duplicate")
    ) {
      throw error ?? new Error("Public comment source was not stored");
    }

    return {
      disposition: result.disposition === "stored" ? "stored" : "duplicate",
      rawCommentId: result.raw_comment_id,
    };
  },

  async recordFailedItem(input) {
    const { error } = await admin.from("comment_import_items").upsert(
      {
        import_job_id: input.jobId,
        workspace_id: input.workspaceId,
        youtube_comment_id: input.youtubeCommentId,
        status: "failed",
        error_code: input.errorCode,
      },
      { onConflict: "import_job_id,youtube_comment_id" },
    );

    if (error) {
      throw error;
    }
  },

  async completeJob(jobId, summary) {
    const { error } = await admin
      .from("comment_import_jobs")
      .update({
        status: summary.status,
        fetched_count: summary.observed,
        stored_count: summary.stored,
        duplicate_count: summary.duplicates,
        failed_count: summary.failed,
        top_level_count: summary.topLevelCount,
        reply_count: summary.replyCount,
        youtube_quota_units_used: summary.youtubeQuotaUnitsUsed,
        next_page_token: null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("source_kind", "public_url");

    if (error) {
      throw error;
    }
  },

  async ensureAnalysisJob({
    configurationKey,
    importJobId,
    rawCommentIds,
    workspaceId,
  }) {
    const { data: existing, error: lookupError } = await admin.from("analysis_jobs")
      .select("id").eq("import_job_id", importJobId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (lookupError) throw lookupError;
    const { data: analysisJob, error: analysisJobError } = existing
      ? { data: existing, error: null }
      : await admin.from("analysis_jobs").upsert({
          workspace_id: workspaceId, import_job_id: importJobId,
          configuration_key: configurationKey, status: "pending", total_count: rawCommentIds.length,
        }, { onConflict: "import_job_id,configuration_key", ignoreDuplicates: true }).select("id").single();

    if (analysisJobError || !analysisJob) {
      throw analysisJobError ?? new Error("Analysis job was not created");
    }

    for (let offset = 0; offset < rawCommentIds.length; offset += 500) {
    const { error: itemError } = await admin.from("analysis_job_items").upsert(
      rawCommentIds.slice(offset, offset + 500).map((rawCommentId) => ({
        analysis_job_id: analysisJob.id,
        workspace_id: workspaceId,
        raw_comment_id: rawCommentId,
        status: "pending" as const,
      })),
      { onConflict: "analysis_job_id,raw_comment_id", ignoreDuplicates: true },
    );

    if (itemError) {
      throw itemError;
    }
    }

    const { error: countError } = await admin.from("analysis_jobs").update({
      total_count: rawCommentIds.length, status: "running", finished_at: null,
    }).eq("id", analysisJob.id).lt("total_count", rawCommentIds.length);
    if (countError) throw countError;
    return analysisJob.id;
  },
});

const toPublicJobRecord = (job: {
  id: string;
  workspace_id: string;
  youtube_video_id: string;
  requested_total_count: number | null;
  source_video_url: string | null;
  provider_mode: string;
  status: PublicImportJobRecord["status"];
  fetched_count: number;
  stored_count: number;
  duplicate_count: number;
  failed_count: number;
  top_level_count: number;
  reply_count: number;
  youtube_quota_units_used: number;
}): PublicImportJobRecord => {
  const requestedTotalCount = publicCommentCountSchema.parse(
    job.requested_total_count,
  );

  if (!job.source_video_url) {
    throw new Error("Public import source URL is missing");
  }

  return {
    id: job.id,
    workspaceId: job.workspace_id,
    youtubeVideoId: job.youtube_video_id,
    requestedTotalCount,
    sourceVideoUrl: job.source_video_url,
    providerMode: parseProviderMode(job.provider_mode),
    status: job.status,
    fetchedCount: job.fetched_count,
    storedCount: job.stored_count,
    duplicateCount: job.duplicate_count,
    failedCount: job.failed_count,
    topLevelCount: job.top_level_count,
    replyCount: job.reply_count,
    youtubeQuotaUnitsUsed: job.youtube_quota_units_used,
  };
};

const mapPublicProviderError = (error: unknown) => {
  if (error instanceof ProviderModeMismatchError) {
    return "provider_mode_mismatch" as const;
  }

  if (!(error instanceof PublicYouTubeProviderError)) {
    return "provider_error" as const;
  }

  if (error.code === "COMMENTS_DISABLED") {
    return "comments_disabled" as const;
  }
  if (error.code === "QUOTA_EXCEEDED") {
    return "quota_exceeded" as const;
  }

  return "provider_error" as const;
};

export async function createPublicImportJobForWorkspace(input: {
  workspaceId: string;
  url: unknown;
  requestedTotalCount: unknown;
}) {
  const admin = createAdminSupabaseClient();
  const provider = createPublicYouTubeReadProvider();

  return createPublicImportJob(input, {
    provider,
    repository: createPublicImportRepository(admin),
  });
}

export async function processPublicImportJobWithSupabase(jobId: string) {
  const admin = createAdminSupabaseClient();
  const environment = getServerEnv();
  const { data: job, error: jobError } = await admin
    .from("comment_import_jobs")
    .select(
      "id, workspace_id, youtube_video_id, requested_total_count, source_video_url, provider_mode, source_kind, status, fetched_count, stored_count, duplicate_count, failed_count, top_level_count, reply_count, youtube_quota_units_used",
    )
    .eq("id", jobId)
    .eq("source_kind", "public_url")
    .maybeSingle();

  if (jobError || !job) {
    throw jobError ?? new Error("Public import job not found");
  }

  const { data: currentPolicy, error: currentPolicyError } = await admin
    .from("creator_policies")
    .select("version")
    .eq("workspace_id", job.workspace_id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (currentPolicyError) {
    throw currentPolicyError;
  }

  const publicJob = toPublicJobRecord(job);
  const repository = createPublicImportRepository(admin);

  assertProviderModeMatchesJob(publicJob.providerMode, environment.EXTERNAL_PROVIDER_MODE);
  const token = randomUUID();
  const { data: claim, error: claimError } = await admin.rpc("claim_public_import_job", {
    target_job_id: jobId, target_token: token,
  });
  if (claimError) throw claimError;
  if (claim === null) return { status: "running", busy: true };
  let stage = "fetch_page";
  try {
    const cursor = publicImportCursorSchema.parse(claim);
    if (!cursor.done) {
      const provider = createPublicYouTubeReadProvider();
      const batch = await withRetry(() => fetchPublicImportBatch(provider, publicJob.youtubeVideoId, cursor), {
        maxAttempts: 3, baseDelayMs: 250,
        isTransient: error => error instanceof PublicYouTubeProviderError && error.code === "TRANSIENT_PROVIDER_ERROR",
      });
      stage = "save_page";
      const { error } = await admin.rpc("commit_public_import_batch", {
        target_job_id: jobId, target_token: token,
        target_comments: batch.comments as unknown as Json,
        target_cursor: batch.cursor as unknown as Json, target_quota: batch.quota,
      });
      if (error) throw error;
    }
    stage = "queue_analysis";
    // Paging avoids Supabase's default 1,000-row response limit. Existing successes stay intact.
    const rawCommentIds: string[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await admin.from("comment_import_items").select("raw_comment_id")
        .eq("import_job_id", jobId).eq("status", "succeeded").order("youtube_comment_id").range(offset, offset + 499);
      if (error) throw error;
      rawCommentIds.push(...(data ?? []).flatMap(row => row.raw_comment_id ? [row.raw_comment_id] : []));
      if (!data || data.length < 500) break;
    }
    const analysisJobId = rawCommentIds.length ? await repository.ensureAnalysisJob({
      importJobId: jobId, workspaceId: publicJob.workspaceId, rawCommentIds,
      configurationKey: createAnalysisConfigurationKey({ policyVersion: currentPolicy?.version ?? 1 }),
    }) : null;
    const { data: current, error } = await admin.from("comment_import_jobs").select("status, fetched_count") .eq("id", jobId).single();
    if (error) throw error;
    await admin.from("comment_import_jobs").update({ last_error_code: null }).eq("id", jobId);
    return { status: current.status, observed: current.fetched_count, analysisJobId };
  } catch (error) {
    const code = mapPublicProviderError(error);
    const { error: logError } = await admin.from("audit_logs").insert({
      workspace_id: publicJob.workspaceId, event_type: "public_import.interrupted",
      target_type: "comment_import_job", target_id: jobId,
      metadata: { stage, error: describeClassificationError(error), errorCode: code } as unknown as Json,
    });
    if (logError) throw logError;
    // The committed cursor and all stored sources remain available for the next invocation.
    await admin.from("comment_import_jobs").update({ last_error_code: code }).eq("id", jobId);
    throw new ImportProcessingError(code, { cause: error });
  } finally {
    await admin.from("public_import_checkpoints").update({ claim_token: null, lease_until: null })
      .eq("import_job_id", jobId).eq("claim_token", token);
  }
}
