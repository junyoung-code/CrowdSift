import { describe, expect, it, vi } from "vitest";

import type { ProviderComment } from "./comment-mapper";
import { ChannelSyncProcessingError } from "./import-errors";
import type { ChannelSyncClaim } from "./channel-comment-sync-service";
import {
  createReplyReconciliationService,
  decodeReplyCursor,
  encodeReplyCursor,
  type ReplyReconciliationRepository,
  type ReplyReconciliationSource,
} from "./reply-reconciliation-service";

const replyClaim: ChannelSyncClaim = {
  settingId: "setting-1",
  runId: "run-1",
  claimToken: "claim-token-1",
  workspaceId: "workspace-1",
  connectionId: "connection-1",
  youtubeChannelId: "channel-1",
  runKind: "reply_reconciliation",
  backfillStartAt: "2026-07-31T15:00:00.000Z",
  pageToken: null,
  lastSuccessfulSyncAt: "2026-08-08T00:00:00.000Z",
  incrementalScanStartedAt: null,
};

const parent = (
  youtubeCommentId: string,
  youtubeVideoId = "video-1",
  overrides: Partial<{
    rawCommentId: string;
    publishedAt: string;
  }> = {},
) => ({
  rawCommentId:
    overrides.rawCommentId ?? "11111111-1111-4111-8111-111111111111",
  youtubeCommentId,
  youtubeVideoId,
  publishedAt: overrides.publishedAt ?? "2026-08-01T00:00:00.000Z",
});

const reply = (
  id: string,
  parentId: string | null = "provider-parent",
): ProviderComment => ({
  id,
  parentId,
  textDisplay: `text-${id}`,
  textOriginal: `original-${id}`,
  authorChannelId: `author-${id}`,
  authorDisplayName: `Author ${id}`,
  authorAvatarUrl: null,
  likeCount: 0,
  moderationStatus: "published",
  publishedAt: "2026-08-08T00:00:00.000Z",
  updatedAt: "2026-08-08T00:00:00.000Z",
  rawPayload: { id },
});

const repository = (): ReplyReconciliationRepository => ({
  listParents: vi.fn(async () => ({ items: [], nextCursor: null })),
  createOrGetVideoImportJob: vi.fn(async ({ youtubeVideoId }) => ({
    id: `job-${youtubeVideoId}`,
    state: "running" as const,
    analyzedCount: 0,
  })),
  storeComment: vi.fn(async ({ comment }) => ({
    disposition: "stored" as const,
    rawCommentId: `raw-${comment.youtubeCommentId}`,
  })),
  recordFailedItem: vi.fn(async () => undefined),
  completeVideoImportJob: vi.fn(async () => undefined),
  attachRecoverableAnalysisItems: vi.fn(async () => ({
    analysisJobId: null,
    attachedRawCommentIds: [],
  })),
  completeRun: vi.fn(async () => undefined),
  failRun: vi.fn(async () => undefined),
});

const source = (): ReplyReconciliationSource => ({
  listReplies: vi.fn(async () => ({
    items: [],
    nextPageToken: null,
    quotaUnitsUsed: 1,
  })),
});

const service = (
  targetRepository: ReplyReconciliationRepository,
  targetSource: ReplyReconciliationSource,
) =>
  createReplyReconciliationService({
    repository: targetRepository,
    source: targetSource,
    analysisConfigurationKey: "classification-v1-key",
    providerMode: "live",
  });

describe("reply reconciliation cursor", () => {
  it("round-trips an opaque validated keyset cursor", () => {
    const cursor = {
      publishedAt: "2026-08-01T00:00:00.000Z",
      id: "11111111-1111-4111-8111-111111111111",
    };

    const encoded = encodeReplyCursor(cursor);

    expect(encoded).not.toContain(cursor.publishedAt);
    expect(decodeReplyCursor(encoded)).toEqual(cursor);
  });

  it.each([
    "not-base64-json",
    Buffer.from(JSON.stringify({ publishedAt: "invalid", id: "bad" })).toString(
      "base64url",
    ),
  ])("rejects an invalid cursor with a stable code", (cursor) => {
    expect(() => decodeReplyCursor(cursor)).toThrowError(
      new ChannelSyncProcessingError("invalid_reply_cursor"),
    );
  });
});

describe("reply reconciliation service", () => {
  it("stores every reply page and analyzes only the first-seen reply", async () => {
    const targetRepository = repository();
    vi.mocked(targetRepository.listParents).mockResolvedValue({
      items: [parent("parent-1")],
      nextCursor: null,
    });
    vi.mocked(targetRepository.storeComment)
      .mockResolvedValueOnce({
        disposition: "duplicate",
        rawCommentId: "raw-existing-reply",
      })
      .mockResolvedValueOnce({
        disposition: "stored",
        rawCommentId: "raw-new-reply",
      });
    vi.mocked(
      targetRepository.attachRecoverableAnalysisItems,
    ).mockResolvedValue({
      analysisJobId: "analysis-job-1",
      attachedRawCommentIds: ["raw-new-reply"],
    });
    const targetSource = source();
    vi.mocked(targetSource.listReplies)
      .mockResolvedValueOnce({
        items: [reply("existing-reply", null)],
        nextPageToken: "reply-page-2",
        quotaUnitsUsed: 1,
      })
      .mockResolvedValueOnce({
        items: [reply("new-reply", "wrong-parent")],
        nextPageToken: null,
        quotaUnitsUsed: 1,
      });

    const result = await service(targetRepository, targetSource).process(
      replyClaim,
    );

    expect(targetRepository.listParents).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      youtubeChannelId: "channel-1",
      publishedAfter: "2026-07-31T15:00:00.000Z",
      cursor: null,
      limit: 20,
    });
    expect(targetSource.listReplies).toHaveBeenNthCalledWith(1, {
      parentYoutubeCommentId: "parent-1",
      maxResults: 100,
      pageToken: undefined,
    });
    expect(targetSource.listReplies).toHaveBeenNthCalledWith(2, {
      parentYoutubeCommentId: "parent-1",
      maxResults: 100,
      pageToken: "reply-page-2",
    });
    expect(targetRepository.storeComment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        youtubeVideoId: "video-1",
        comment: expect.objectContaining({
          youtubeCommentId: "new-reply",
          parentYoutubeCommentId: "parent-1",
        }),
      }),
    );
    expect(targetRepository.completeVideoImportJob).toHaveBeenCalledWith({
      importJobId: "job-video-1",
      runId: "run-1",
      claimToken: "claim-token-1",
      observedCount: 2,
      storedCount: 1,
      updatedCount: 0,
      duplicateCount: 1,
      failedCount: 0,
      topLevelCount: 0,
      replyCount: 2,
      quotaUnitsUsed: 2,
      errorCode: null,
      status: "succeeded",
    });
    expect(targetRepository.attachRecoverableAnalysisItems).toHaveBeenCalledWith({
      importJobId: "job-video-1",
      runId: "run-1",
      claimToken: "claim-token-1",
      workspaceId: "workspace-1",
      youtubeVideoId: "video-1",
      configurationKey: "classification-v1-key",
    });
    expect(result).toMatchObject({
      storedCount: 1,
      duplicateCount: 1,
      analyzedCount: 1,
      quotaUnitsUsed: 2,
      nextCursor: null,
      analysisJobIds: ["analysis-job-1"],
    });
    expect(result).not.toHaveProperty("claimToken");
  });

  it("decodes the input keyset and completes with the next opaque cursor", async () => {
    const inputCursor = {
      publishedAt: "2026-08-01T00:00:00.000Z",
      id: "11111111-1111-4111-8111-111111111111",
    };
    const nextCursor = {
      publishedAt: "2026-08-02T00:00:00.000Z",
      id: "22222222-2222-4222-8222-222222222222",
    };
    const targetRepository = repository();
    vi.mocked(targetRepository.listParents).mockResolvedValue({
      items: [
        parent("parent-2", "video-2", {
          rawCommentId: nextCursor.id,
          publishedAt: nextCursor.publishedAt,
        }),
      ],
      nextCursor,
    });

    const result = await service(targetRepository, source()).process({
      ...replyClaim,
      pageToken: encodeReplyCursor(inputCursor),
    });

    expect(targetRepository.listParents).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: inputCursor, limit: 20 }),
    );
    expect(targetRepository.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        claimToken: "claim-token-1",
        replyCursor: encodeReplyCursor(nextCursor),
      }),
    );
    expect(result.nextCursor).toBe(encodeReplyCursor(nextCursor));
  });

  it("uses a null cursor so completion schedules the next pass in 24 hours", async () => {
    const targetRepository = repository();

    await service(targetRepository, source()).process(replyClaim);

    expect(targetRepository.completeRun).toHaveBeenCalledWith({
      runId: "run-1",
      claimToken: "claim-token-1",
      replyCursor: null,
      observedCount: 0,
      storedCount: 0,
      updatedCount: 0,
      duplicateCount: 0,
      failedCount: 0,
      analyzedCount: 0,
      quotaUnitsUsed: 0,
    });
  });

  it("fails the fenced run on an invalid cursor without restarting", async () => {
    const targetRepository = repository();

    await expect(
      service(targetRepository, source()).process({
        ...replyClaim,
        pageToken: "invalid-cursor",
      }),
    ).rejects.toMatchObject({ code: "invalid_reply_cursor" });

    expect(targetRepository.listParents).not.toHaveBeenCalled();
    expect(targetRepository.failRun).toHaveBeenCalledWith({
      runId: "run-1",
      claimToken: "claim-token-1",
      errorCode: "invalid_reply_cursor",
    });
  });

  it("isolates a reply storage failure from its siblings", async () => {
    const targetRepository = repository();
    vi.mocked(targetRepository.listParents).mockResolvedValue({
      items: [parent("parent-1")],
      nextCursor: null,
    });
    vi.mocked(targetRepository.storeComment)
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValueOnce({
        disposition: "stored",
        rawCommentId: "raw-reply-2",
      });
    const targetSource = source();
    vi.mocked(targetSource.listReplies).mockResolvedValue({
      items: [reply("reply-1"), reply("reply-2")],
      nextPageToken: null,
      quotaUnitsUsed: 1,
    });

    const result = await service(targetRepository, targetSource).process(
      replyClaim,
    );

    expect(targetRepository.recordFailedItem).toHaveBeenCalledWith({
      importJobId: "job-video-1",
      runId: "run-1",
      claimToken: "claim-token-1",
      workspaceId: "workspace-1",
      youtubeCommentId: "reply-1",
      errorCode: "source_store_failed",
    });
    expect(targetRepository.storeComment).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ storedCount: 1, failedCount: 1 });
  });

  it.each([
    ["quotaExceeded", "quota_exceeded"],
    ["insufficientPermissions", "permission_revoked"],
    ["backendError", "provider_error"],
  ] as const)(
    "fails the fenced reply run with stable provider code %s",
    async (reason, expectedCode) => {
      const targetRepository = repository();
      vi.mocked(targetRepository.listParents).mockResolvedValue({
        items: [parent("parent-1")],
        nextCursor: null,
      });
      const targetSource = source();
      vi.mocked(targetSource.listReplies).mockRejectedValue({
        response: { data: { error: { errors: [{ reason }] } } },
      });

      await expect(
        service(targetRepository, targetSource).process(replyClaim),
      ).rejects.toMatchObject({ code: expectedCode });

      expect(targetRepository.failRun).toHaveBeenCalledWith({
        runId: "run-1",
        claimToken: "claim-token-1",
        errorCode: expectedCode,
      });
      expect(targetRepository.completeRun).not.toHaveBeenCalled();
    },
  );

  it("uses a terminal video snapshot without repeating provider or write work", async () => {
    const targetRepository = repository();
    vi.mocked(targetRepository.listParents).mockResolvedValue({
      items: [parent("parent-1")],
      nextCursor: null,
    });
    vi.mocked(targetRepository.createOrGetVideoImportJob).mockResolvedValue({
      id: "terminal-job",
      state: "terminal",
      status: "succeeded",
      storedCount: 2,
      updatedCount: 1,
      duplicateCount: 3,
      failedCount: 0,
      analyzedCount: 2,
      quotaUnitsUsed: 7,
    });
    const targetSource = source();

    const result = await service(targetRepository, targetSource).process(
      replyClaim,
    );

    expect(targetSource.listReplies).not.toHaveBeenCalled();
    expect(targetRepository.storeComment).not.toHaveBeenCalled();
    expect(targetRepository.recordFailedItem).not.toHaveBeenCalled();
    expect(targetRepository.completeVideoImportJob).not.toHaveBeenCalled();
    expect(
      targetRepository.attachRecoverableAnalysisItems,
    ).not.toHaveBeenCalled();
    expect(targetRepository.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        observedCount: 6,
        storedCount: 2,
        updatedCount: 1,
        duplicateCount: 3,
        failedCount: 0,
        analyzedCount: 2,
        quotaUnitsUsed: 7,
      }),
    );
    expect(result.importJobIds).toEqual(["terminal-job"]);
  });
});

describe("reply reconciliation Supabase adapter", () => {
  it("dispatches a reply claim to reconciliation instead of channel-page collection", async () => {
    vi.resetModules();
    const processReplyClaim = vi.fn(async () => ({ runId: "run-1" }));
    const createReplyReconciliationService = vi.fn(() => ({
      process: processReplyClaim,
    }));
    const createChannelCommentSyncService = vi.fn();
    const provider = { listReplies: vi.fn() };
    const claimRow = {
      setting_id: "setting-1",
      run_id: "run-1",
      claim_token: "claim-token-1",
      workspace_id: "workspace-1",
      connection_id: "connection-1",
      youtube_channel_id: "channel-1",
      run_kind: "reply_reconciliation",
      backfill_start_at: "2026-07-31T15:00:00.000Z",
      page_token: null,
      last_successful_sync_at: "2026-08-08T00:00:00.000Z",
      incremental_scan_started_at: null,
    };
    const rpc = vi.fn(async (name: string) =>
      name === "claim_channel_comment_sync_work"
        ? { data: [claimRow], error: null }
        : { data: [], error: null },
    );
    const queryFor = (table: string) => {
      const result =
        table === "youtube_connections"
          ? {
              data: {
                id: "connection-1",
                status: "connected",
                encrypted_access_token: "encrypted-access",
                encrypted_refresh_token: "encrypted-refresh",
                token_expires_at: null,
                granted_scopes: [],
                google_subject: null,
              },
              error: null,
            }
          : { data: { version: 7 }, error: null };
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order", "limit"]) {
        builder[method] = () => builder;
      }
      builder.maybeSingle = async () => result;
      return builder;
    };
    const admin = {
      rpc,
      from: vi.fn((table: string) => queryFor(table)),
    };
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminSupabaseClient: () => admin,
    }));
    vi.doMock("@/lib/env", () => ({
      getServerEnv: () => ({
        EXTERNAL_PROVIDER_MODE: "live",
        YOUTUBE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
        OPENAI_MODERATION_MODEL: "moderation-current",
        OPENAI_LUNA_MODEL: "luna-current",
        OPENAI_TERRA_MODEL: "terra-current",
      }),
    }));
    // 이 테스트가 보는 것은 「어느 서비스로 넘기는가」다. 토큰 복호화는 여기 관심사가
    // 아니므로 연결을 여는 자리를 통째로 대신한다.
    vi.doMock("@/features/youtube/owner-connection", () => ({
      OWNER_CONNECTION_COLUMNS: "id, status",
      isUsableOwnerConnection: () => true,
      openOwnerConnection: () => ({
        provider,
        tokens: { accessToken: "owner-access", refreshToken: null, expiresAt: null },
      }),
    }));
    vi.doMock("@/features/classification/configuration", () => ({
      createClassificationConfigurationKey: () => "classification-v1-key",
    }));
    vi.doMock("./reply-reconciliation-service", async (importOriginal) => ({
      ...(await importOriginal()),
      createReplyReconciliationService,
    }));
    vi.doMock("./channel-comment-sync-service", async (importOriginal) => ({
      ...(await importOriginal()),
      createChannelCommentSyncService,
    }));

    const { processOneChannelSyncWork } = await import(
      "./process-channel-comment-sync"
    );
    await processOneChannelSyncWork({});

    expect(createReplyReconciliationService).toHaveBeenCalledWith(
      expect.objectContaining({
        providerMode: "live",
        analysisConfigurationKey: "classification-v1-key",
      }),
    );
    expect(processReplyClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        runKind: "reply_reconciliation",
        claimToken: "claim-token-1",
      }),
    );
    expect(createChannelCommentSyncService).not.toHaveBeenCalled();

    vi.doUnmock("server-only");
    vi.doUnmock("@/lib/supabase/admin");
    vi.doUnmock("@/lib/env");
    vi.doUnmock("@/features/youtube/provider-factory");
    vi.doUnmock("@/features/classification/configuration");
    vi.doUnmock("./reply-reconciliation-service");
    vi.doUnmock("./channel-comment-sync-service");
  });

  it("builds the exact fenced completion payload with the opaque cursor", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    const adapter = await import("./process-channel-comment-sync");
    const build = Reflect.get(
      adapter,
      "buildCompleteReplyReconciliationRunRpcArgs",
    );
    const actual =
      typeof build === "function"
        ? build({
            runId: "run-1",
            claimToken: "private-claim-token",
            replyCursor: "opaque-next-cursor",
            observedCount: 4,
            storedCount: 1,
            updatedCount: 1,
            duplicateCount: 1,
            failedCount: 1,
            analyzedCount: 1,
            quotaUnitsUsed: 7,
          })
        : null;

    expect(actual).toEqual({
      target_run_id: "run-1",
      target_claim_token: "private-claim-token",
      target_next_page_token: null,
      target_reached_boundary: false,
      target_observed_count: 4,
      target_stored_count: 1,
      target_updated_count: 1,
      target_duplicate_count: 1,
      target_failed_count: 1,
      target_analyzed_count: 1,
      target_quota_units_used: 7,
      target_reply_cursor: "opaque-next-cursor",
    });
    vi.doUnmock("server-only");
  });

  it("maps only 20 parents and advances after the last processed keyset", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    const adapter = await import("./process-channel-comment-sync");
    const mapPage = Reflect.get(adapter, "toReplyReconciliationParentPage");
    const rows = Array.from({ length: 21 }, (_, index) => ({
      id: `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
      youtube_comment_id: `parent-${index + 1}`,
      youtube_video_id: "video-1",
      published_at: `2026-08-01T00:00:${String(index).padStart(2, "0")}.000Z`,
    }));
    const actual = typeof mapPage === "function" ? mapPage(rows, 20) : null;

    expect(actual?.items).toHaveLength(20);
    expect(actual?.items.at(-1)).toMatchObject({
      rawCommentId: rows[19]?.id,
      youtubeCommentId: "parent-20",
    });
    expect(actual?.nextCursor).toEqual({
      publishedAt: rows[19]?.published_at,
      id: rows[19]?.id,
    });
    vi.doUnmock("server-only");
  });

  it("normalizes Postgres timestamp offsets before encoding the next cursor", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    const adapter = await import("./process-channel-comment-sync");
    const mapPage = Reflect.get(adapter, "toReplyReconciliationParentPage");
    const rows = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        youtube_comment_id: "parent-1",
        youtube_video_id: "video-1",
        published_at: "2026-08-01T09:00:00+09:00",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        youtube_comment_id: "parent-2",
        youtube_video_id: "video-1",
        published_at: "2026-08-01T09:01:00+09:00",
      },
    ];
    const actual = typeof mapPage === "function" ? mapPage(rows, 1) : null;

    expect(actual?.nextCursor).toEqual({
      publishedAt: "2026-08-01T00:00:00.000Z",
      id: rows[0]?.id,
    });
    vi.doUnmock("server-only");
  });

  it("queries claimed-channel parents with the exact tuple keyset", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    const calls: Array<[string, ...unknown[]]> = [];
    const rows = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        youtube_comment_id: "parent-2",
        youtube_video_id: "video-2",
        published_at: "2026-08-02T00:00:00.000Z",
      },
    ];
    const builder: Record<string, unknown> = {};
    for (const method of [
      "select",
      "eq",
      "is",
      "gte",
      "or",
      "order",
      "limit",
    ]) {
      builder[method] = (...args: unknown[]) => {
        calls.push([method, ...args]);
        return builder;
      };
    }
    builder.then = (
      resolve: (value: { data: typeof rows; error: null }) => unknown,
    ) => resolve({ data: rows, error: null });
    const admin = {
      from: vi.fn(() => builder),
      rpc: vi.fn(),
    };
    const adapter = await import("./process-channel-comment-sync");
    const createRepository = Reflect.get(
      adapter,
      "createReplyReconciliationRepository",
    );
    const targetRepository =
      typeof createRepository === "function"
        ? createRepository(admin)
        : null;
    const cursor = {
      publishedAt: "2026-08-01T00:00:00.000Z",
      id: "11111111-1111-4111-8111-111111111111",
    };

    const actual = await targetRepository?.listParents({
      workspaceId: "workspace-1",
      youtubeChannelId: "channel-1",
      publishedAfter: "2026-07-31T15:00:00.000Z",
      cursor,
      limit: 20,
    });

    expect(admin.from).toHaveBeenCalledWith("raw_comments");
    expect(calls).toContainEqual(["eq", "workspace_id", "workspace-1"]);
    expect(calls).toContainEqual([
      "eq",
      "first_import.trigger_kind",
      "channel_sync",
    ]);
    expect(calls).toContainEqual([
      "eq",
      "first_import.source_kind",
      "owned_oauth",
    ]);
    expect(calls).toContainEqual([
      "eq",
      "first_import.sync_run.setting.youtube_channel_id",
      "channel-1",
    ]);
    expect(calls).toContainEqual(["is", "parent_youtube_comment_id", null]);
    expect(calls).toContainEqual([
      "gte",
      "published_at",
      "2026-07-31T15:00:00.000Z",
    ]);
    expect(calls).toContainEqual([
      "or",
      "published_at.gt.2026-08-01T00:00:00.000Z,and(published_at.eq.2026-08-01T00:00:00.000Z,id.gt.11111111-1111-4111-8111-111111111111)",
    ]);
    expect(calls).toContainEqual(["order", "published_at", { ascending: true }]);
    expect(calls).toContainEqual(["order", "id", { ascending: true }]);
    expect(calls).toContainEqual(["limit", 21]);
    expect(actual).toEqual({
      items: [
        {
          rawCommentId: rows[0]?.id,
          youtubeCommentId: "parent-2",
          youtubeVideoId: "video-2",
          publishedAt: "2026-08-02T00:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
    vi.doUnmock("server-only");
  });
});
