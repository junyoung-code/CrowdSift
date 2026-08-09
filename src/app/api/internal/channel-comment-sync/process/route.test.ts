import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateAdminSupabaseClient,
  mockGetServerEnv,
  mockProcessOneChannelSyncWork,
  mockProcessPendingChannelClassification,
  mockRequireViewer,
} = vi.hoisted(() => ({
  mockCreateAdminSupabaseClient: vi.fn(),
  mockGetServerEnv: vi.fn(),
  mockProcessOneChannelSyncWork: vi.fn(),
  mockProcessPendingChannelClassification: vi.fn(),
  mockRequireViewer: vi.fn(),
}));

vi.mock("@/features/auth/require-viewer", () => ({
  requireViewer: mockRequireViewer,
}));

vi.mock("@/features/ingestion/process-channel-comment-sync", () => ({
  processOneChannelSyncWork: mockProcessOneChannelSyncWork,
  processPendingChannelClassification:
    mockProcessPendingChannelClassification,
}));

vi.mock("@/lib/env", () => ({ getServerEnv: mockGetServerEnv }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: mockCreateAdminSupabaseClient,
}));

import { POST as processForViewer } from "@/app/api/channel-comment-sync/process/route";
import { GET as getStatus } from "@/app/api/channel-comment-sync/status/route";

import { GET as processForCron } from "./route";

type QueryCall = [method: string, ...arguments_: unknown[]];

const query = (result: unknown, calls: QueryCall[]) => {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "not", "order", "limit"]) {
    builder[method] = vi.fn((...arguments_: unknown[]) => {
      calls.push([method, ...arguments_]);
      return builder;
    });
  }
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = (
    resolve: (value: unknown) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
};

describe("channel comment sync routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerEnv.mockReturnValue({ CRON_SECRET: "c".repeat(32) });
    mockRequireViewer.mockResolvedValue({
      userId: "user-1",
      workspaceId: "workspace-1",
    });
    mockProcessOneChannelSyncWork.mockResolvedValue({
      runId: "private-run-id",
      importJobIds: ["private-import-id"],
    });
    mockProcessPendingChannelClassification.mockResolvedValue({
      status: "running",
      total: 99,
      completed: 5,
      failed: 0,
      remaining: 94,
    });
  });

  it("rejects cron requests without the timing-safe bearer secret", async () => {
    const missing = await processForCron(
      new Request(
        "http://localhost/api/internal/channel-comment-sync/process",
      ),
    );
    const wrong = await processForCron(
      new Request(
        "http://localhost/api/internal/channel-comment-sync/process",
        { headers: { authorization: `Bearer ${"x".repeat(32)}` } },
      ),
    );

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(mockProcessOneChannelSyncWork).not.toHaveBeenCalled();
    expect(mockProcessPendingChannelClassification).not.toHaveBeenCalled();
  });

  it("rejects cron requests when no secret is configured", async () => {
    mockGetServerEnv.mockReturnValue({ CRON_SECRET: undefined });

    const response = await processForCron(
      new Request(
        "http://localhost/api/internal/channel-comment-sync/process",
        { headers: { authorization: `Bearer ${"c".repeat(32)}` } },
      ),
    );

    expect(response.status).toBe(401);
    expect(mockProcessOneChannelSyncWork).not.toHaveBeenCalled();
  });

  it("runs one global sync claim and at most five analysis items without leaking worker data", async () => {
    const response = await processForCron(
      new Request(
        "http://localhost/api/internal/channel-comment-sync/process",
        { headers: { authorization: `Bearer ${"c".repeat(32)}` } },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { syncProcessed: true, analysisProcessed: true },
    });
    expect(mockProcessOneChannelSyncWork).toHaveBeenCalledTimes(1);
    expect(mockProcessOneChannelSyncWork).toHaveBeenCalledWith({});
    expect(mockProcessPendingChannelClassification).toHaveBeenCalledWith({
      maxItems: 5,
    });
  });

  it("uses the authenticated workspace for one user sync claim and five analysis items", async () => {
    const response = await processForViewer();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { syncProcessed: true, analysisProcessed: true },
    });
    expect(mockRequireViewer).toHaveBeenCalledTimes(1);
    expect(mockProcessOneChannelSyncWork).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    });
    expect(mockProcessPendingChannelClassification).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      maxItems: 5,
    });
  });

  it("returns only the safe workspace progress DTO and keeps pending analysis active", async () => {
    const settingCalls: QueryCall[] = [];
    const runCalls: QueryCall[] = [];
    const jobsCalls: QueryCall[] = [];
    const itemsCalls: QueryCall[] = [];
    const builders = {
      channel_comment_sync_settings: query(
        {
          data: {
            id: "private-setting-id",
            enabled: true,
            backfill_start_at: "2026-07-31T15:00:00.000Z",
            backfill_status: "completed",
            last_successful_sync_at: "2026-08-08T03:00:00.000Z",
            last_error_code: null,
          },
          error: null,
        },
        settingCalls,
      ),
      channel_comment_sync_runs: query(
        {
          data: {
            kind: "backfill_recent",
            status: "succeeded",
            stored_count: 7,
            duplicate_count: 2,
            failed_count: 0,
            analyzed_count: 7,
            error_code: null,
            started_at: "2026-08-08T02:00:00.000Z",
            finished_at: "2026-08-08T03:00:00.000Z",
          },
          error: null,
        },
        runCalls,
      ),
      analysis_jobs: query(
        { data: [{ id: "private-analysis-id" }], error: null },
        jobsCalls,
      ),
      analysis_job_items: query(
        { data: null, count: 2, error: null },
        itemsCalls,
      ),
    };
    mockCreateAdminSupabaseClient.mockReturnValue({
      from: vi.fn((table: keyof typeof builders) => builders[table]),
    });

    const response = await getStatus();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      configured: true,
      active: true,
      startDate: "2026-08-01",
      statusMessage: "저장한 댓글을 분류하고 있습니다.",
      counts: { stored: 7, duplicate: 2, failed: 0, analyzed: 7 },
    });
    expect(body).not.toHaveProperty("pendingAnalysisCount");
    expect(body).not.toHaveProperty("workspaceId");
    expect(body).not.toHaveProperty("settingId");
    expect(body).not.toHaveProperty("analysisJobId");
    expect(settingCalls).toContainEqual(["eq", "workspace_id", "workspace-1"]);
    expect(runCalls).toContainEqual(["eq", "workspace_id", "workspace-1"]);
    expect(jobsCalls).toContainEqual(["eq", "workspace_id", "workspace-1"]);
    expect(itemsCalls).toContainEqual(["eq", "workspace_id", "workspace-1"]);
  });
});
