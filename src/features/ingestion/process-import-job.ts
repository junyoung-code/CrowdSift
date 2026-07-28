import "server-only";

import { createHash } from "node:crypto";

import type { Json } from "@/types/database";
import { getServerEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createYouTubeProvider } from "@/features/youtube/provider-factory";
import { decryptToken, encryptToken } from "@/features/youtube/token-crypto";
import type { OAuthTokens } from "@/features/youtube/contracts";
import {
  ProviderModeMismatchError,
  assertProviderModeMatchesJob,
} from "@/features/providers/provider-mode";

import { fetchSourceCommentPage } from "./comment-mapper";
import {
  ImportProcessingError,
  type ImportFailureCode,
} from "./import-errors";
import {
  createCommentImportService,
  type CommentImportRepository,
} from "./comment-import-service";
import { processPublicImportJobWithSupabase } from "./process-public-import-job";

export { ImportProcessingError } from "./import-errors";

const getProviderReason = (error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "data" in error.response
  ) {
    const data = error.response.data as {
      error?: { errors?: Array<{ reason?: string }> };
    };
    return data.error?.errors?.[0]?.reason ?? null;
  }

  return null;
};

const classifyProviderError = (error: unknown): ImportFailureCode => {
  const reason = getProviderReason(error);

  if (reason === "commentsDisabled") {
    return "comments_disabled";
  }
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
    return "quota_exceeded";
  }
  if (
    reason === "authError" ||
    reason === "forbidden" ||
    reason === "insufficientPermissions"
  ) {
    return "permission_revoked";
  }
  return "provider_error";
};

const nullableText = (value: string | null): string => value as string;

export const processImportJob = async (jobId: string) => {
  const environment = getServerEnv();
  const admin = createAdminSupabaseClient();
  const { data: job, error: jobError } = await admin
    .from("comment_import_jobs")
    .select(
      "id, workspace_id, youtube_video_id, requested_top_level_count, provider_mode, source_kind, next_page_token, status, fetched_count, stored_count, duplicate_count, failed_count",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (jobError || !job) {
    throw new Error("Import job not found");
  }

  try {
    assertProviderModeMatchesJob(
      job.provider_mode,
      environment.EXTERNAL_PROVIDER_MODE,
    );
  } catch (error) {
    if (error instanceof ProviderModeMismatchError) {
      throw new ImportProcessingError("provider_mode_mismatch", {
        cause: error,
      });
    }
    throw error;
  }

  if (job.source_kind === "public_url") {
    return processPublicImportJobWithSupabase(job.id);
  }

  if (
    job.source_kind !== "owned_oauth" ||
    job.requested_top_level_count === null
  ) {
    throw new Error("Public import processing is not connected yet");
  }
  const requestedTopLevelCount = job.requested_top_level_count;

  const [
    { data: connection, error: connectionError },
    { data: selectedChannel, error: channelError },
    { data: currentPolicy, error: policyError },
  ] = await Promise.all([
    admin
      .from("youtube_connections")
      .select(
        "encrypted_access_token, encrypted_refresh_token, token_expires_at, granted_scopes, google_subject, status",
      )
      .eq("workspace_id", job.workspace_id)
      .maybeSingle(),
    admin
      .from("youtube_channel_candidates")
      .select("youtube_channel_id")
      .eq("workspace_id", job.workspace_id)
      .eq("selected", true)
      .maybeSingle(),
    admin
      .from("creator_policies")
      .select("version")
      .eq("workspace_id", job.workspace_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (
    connectionError ||
    channelError ||
    policyError ||
    !connection?.encrypted_access_token ||
    !selectedChannel ||
    connection.status !== "connected"
  ) {
    await admin
      .from("comment_import_jobs")
      .update({
        status: "failed",
        last_error_code: "permission_revoked",
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    throw new ImportProcessingError("permission_revoked");
  }

  const encryptionKey = Buffer.from(
    environment.YOUTUBE_TOKEN_ENCRYPTION_KEY,
    "base64",
  );
  const tokens: OAuthTokens = {
    accessToken: decryptToken(
      connection.encrypted_access_token,
      encryptionKey,
    ),
    refreshToken: connection.encrypted_refresh_token
      ? decryptToken(connection.encrypted_refresh_token, encryptionKey)
      : null,
    expiresAt: connection.token_expires_at,
    grantedScopes: connection.granted_scopes,
    googleSubject: connection.google_subject,
  };
  const provider = createYouTubeProvider({
    async onTokenRefresh(refreshed) {
      const update: {
        encrypted_access_token?: string;
        encrypted_refresh_token?: string;
        token_expires_at?: string | null;
        updated_at: string;
      } = { updated_at: new Date().toISOString() };

      if (refreshed.accessToken) {
        update.encrypted_access_token = encryptToken(
          refreshed.accessToken,
          encryptionKey,
        );
      }
      if (refreshed.refreshToken) {
        update.encrypted_refresh_token = encryptToken(
          refreshed.refreshToken,
          encryptionKey,
        );
      }
      if (refreshed.expiresAt !== null) {
        update.token_expires_at = refreshed.expiresAt;
      }

      await admin
        .from("youtube_connections")
        .update(update)
        .eq("workspace_id", job.workspace_id);
    },
  });
  const configurationKey = createHash("sha256")
    .update(
      JSON.stringify({
        policyVersion: currentPolicy?.version ?? 1,
        promptVersion: "stage-1-v1",
        model: environment.OPENAI_ANALYSIS_MODEL,
        schemaVersion: "comment-analysis-v1",
      }),
    )
    .digest("hex");

  const repository: CommentImportRepository = {
    async getJob(targetJobId) {
      if (targetJobId !== job.id) {
        return null;
      }
      return {
        id: job.id,
        workspaceId: job.workspace_id,
        youtubeVideoId: job.youtube_video_id,
        requestedTopLevelCount,
        nextPageToken: job.next_page_token,
        status: job.status,
        fetchedCount: job.fetched_count,
        storedCount: job.stored_count,
        duplicateCount: job.duplicate_count,
        failedCount: job.failed_count,
      };
    },
    async markRunning(targetJobId) {
      const { error } = await admin
        .from("comment_import_jobs")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
          last_error_code: null,
        })
        .eq("id", targetJobId);
      if (error) throw error;
    },
    async upsertSource({
      comment,
      jobId: targetJobId,
      workspaceId,
      youtubeVideoId,
    }) {
      const { data, error } = await admin.rpc("store_import_comment_item", {
        target_import_job_id: targetJobId,
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

      if (
        error ||
        !result ||
        (result.disposition !== "stored" &&
          result.disposition !== "duplicate")
      ) {
        throw error ?? new Error("Comment source was not stored");
      }

      return {
        disposition: result.disposition,
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
      if (error) throw error;
    },
    async completeJob(targetJobId, summary) {
      const { error } = await admin
        .from("comment_import_jobs")
        .update({
          status: summary.status,
          fetched_count: summary.fetched,
          stored_count: summary.stored,
          duplicate_count: summary.duplicates,
          failed_count: summary.failed,
          next_page_token: summary.nextPageToken,
          finished_at: new Date().toISOString(),
        })
        .eq("id", targetJobId);
      if (error) throw error;
    },
    async ensureAnalysisJob({
      configurationKey: targetConfigurationKey,
      importJobId,
      rawCommentIds,
      workspaceId,
    }) {
      const { data: analysisJob, error: analysisJobError } = await admin
        .from("analysis_jobs")
        .upsert(
          {
            workspace_id: workspaceId,
            import_job_id: importJobId,
            configuration_key: targetConfigurationKey,
            status: "pending",
            total_count: rawCommentIds.length,
          },
          { onConflict: "import_job_id,configuration_key" },
        )
        .select("id")
        .single();
      if (analysisJobError) throw analysisJobError;

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
    },
  };
  const source = {
    fetchPage: ({
      pageToken,
      topLevelLimit,
      youtubeVideoId,
    }: {
      youtubeVideoId: string;
      topLevelLimit: number;
      pageToken?: string;
    }) =>
      fetchSourceCommentPage({
        youtubeVideoId,
        topLevelLimit,
        pageToken,
        provider: {
          listCommentThreads: (input) =>
            provider.listCommentThreads({ ...input, tokens }),
          listReplies: (input) => provider.listReplies({ ...input, tokens }),
        },
      }),
  };

  try {
    return await createCommentImportService({
      source,
      repository,
      analysisConfigurationKey: configurationKey,
    }).process(jobId);
  } catch (error) {
    const code =
      error instanceof ImportProcessingError
        ? error.code
        : classifyProviderError(error);
    await admin
      .from("comment_import_jobs")
      .update({
        status: "failed",
        last_error_code: code,
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    throw new ImportProcessingError(code, { cause: error });
  }
};
