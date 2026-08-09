import { afterEach, describe, expect, it, vi } from "vitest";

import { toChannelSyncProgress } from "./channel-sync-progress";

const setting = (
  overrides: Partial<{
    enabled: boolean;
    backfill_start_at: string;
    backfill_status: string;
    last_successful_sync_at: string | null;
    last_error_code: string | null;
  }> = {},
) => ({
  enabled: true,
  backfill_start_at: "2026-07-31T15:00:00.000Z",
  backfill_status: "running",
  last_successful_sync_at: null,
  last_error_code: null,
  ...overrides,
});

const latestRun = (
  overrides: Partial<{
    kind: string;
    status: string;
    stored_count: number;
    duplicate_count: number;
    failed_count: number;
    analyzed_count: number;
    error_code: string | null;
    started_at: string | null;
    finished_at: string | null;
  }> = {},
) => ({
  kind: "backfill_recent",
  status: "running",
  stored_count: 12,
  duplicate_count: 3,
  failed_count: 1,
  analyzed_count: 10,
  error_code: null,
  started_at: "2026-08-08T01:00:00.000Z",
  finished_at: null,
  ...overrides,
});

describe("channel sync progress DTO", () => {
  it("returns a safe unconfigured state without internal identifiers", () => {
    const progress = toChannelSyncProgress({ setting: null, latestRun: null });

    expect(progress).toEqual({
      configured: false,
      enabled: false,
      active: false,
      startDate: null,
      backfillStatus: "not_configured",
      backfillLabel: "시작 날짜를 선택해 주세요",
      lastSuccessfulSyncAt: null,
      counts: { stored: 0, duplicate: 0, failed: 0, analyzed: 0 },
      statusMessage: "채널 댓글 동기화를 아직 설정하지 않았습니다.",
      errorMessage: null,
    });
    expect(progress).not.toHaveProperty("claimToken");
    expect(progress).not.toHaveProperty("workspaceId");
    expect(progress).not.toHaveProperty("settingId");
  });

  it("maps an active backfill with the Korean start date and real latest-run counts", () => {
    const progress = toChannelSyncProgress({
      setting: setting(),
      latestRun: latestRun(),
    });

    expect(progress).toEqual({
      configured: true,
      enabled: true,
      active: true,
      startDate: "2026-08-01",
      backfillStatus: "running",
      backfillLabel: "초기 댓글 수집 중",
      lastSuccessfulSyncAt: null,
      counts: { stored: 12, duplicate: 3, failed: 1, analyzed: 10 },
      statusMessage: "선택한 날짜까지 댓글을 가져오고 있습니다.",
      errorMessage: null,
    });
  });

  it("keeps completed progress paused without inventing a percentage", () => {
    const progress = toChannelSyncProgress({
      setting: setting({
        enabled: false,
        backfill_status: "completed",
        last_successful_sync_at: "2026-08-08T03:00:00.000Z",
      }),
      latestRun: latestRun({
        kind: "incremental",
        status: "succeeded",
        stored_count: 2,
        duplicate_count: 8,
        failed_count: 0,
        analyzed_count: 2,
        finished_at: "2026-08-08T03:00:00.000Z",
      }),
    });

    expect(progress).toMatchObject({
      enabled: false,
      active: false,
      backfillStatus: "completed",
      backfillLabel: "초기 댓글 수집 완료",
      lastSuccessfulSyncAt: "2026-08-08T03:00:00.000Z",
      statusMessage: "자동 동기화를 일시중지했습니다.",
      counts: { stored: 2, duplicate: 8, failed: 0, analyzed: 2 },
    });
    expect(progress).not.toHaveProperty("percent");
    expect(progress).not.toHaveProperty("totalCount");
  });

  it("maps stable failures to a user-facing alert without exposing raw records", () => {
    const progress = toChannelSyncProgress({
      setting: setting({
        backfill_status: "failed",
        last_error_code: "permission_revoked",
      }),
      latestRun: latestRun({
        status: "failed",
        error_code: "permission_revoked",
      }),
    });

    expect(progress).toMatchObject({
      active: false,
      backfillStatus: "failed",
      backfillLabel: "초기 댓글 수집 실패",
      errorMessage:
        "YouTube 읽기 권한을 확인할 수 없습니다. 채널을 다시 연결해 주세요.",
    });
  });
});

describe("channel sync Server Actions", () => {
  afterEach(() => {
    vi.doUnmock("server-only");
    vi.doUnmock("next/cache");
    vi.doUnmock("next/navigation");
    vi.doUnmock("@/features/auth/require-viewer");
    vi.doUnmock("@/lib/supabase/server");
  });

  it("validates the date, re-authorizes the workspace, configures, revalidates, and redirects", async () => {
    vi.resetModules();
    const rpc = vi.fn(async () => ({ data: {}, error: null }));
    const requireViewer = vi.fn(async () => ({
      userId: "user-1",
      workspaceId: "workspace-1",
    }));
    const revalidatePath = vi.fn();
    const redirect = vi.fn((path: string): never => {
      throw new Error(`redirect:${path}`);
    });
    vi.doMock("server-only", () => ({}));
    vi.doMock("next/cache", () => ({ revalidatePath }));
    vi.doMock("next/navigation", () => ({ redirect }));
    vi.doMock("@/features/auth/require-viewer", () => ({ requireViewer }));
    vi.doMock("@/lib/supabase/server", () => ({
      createServerSupabaseClient: async () => ({ rpc }),
    }));
    const { configureChannelCommentSyncAction } = await import(
      "@/app/(product)/app/connect/youtube/actions"
    );
    const formData = new FormData();
    formData.set("startDate", "2026-08-01");

    await expect(
      configureChannelCommentSyncAction(formData),
    ).rejects.toThrow("redirect:/app/connect/youtube?sync=started");

    expect(requireViewer).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("configure_channel_comment_sync", {
      target_workspace_id: "workspace-1",
      target_start_date: "2026-08-01",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/app/connect/youtube");
    expect(redirect).toHaveBeenLastCalledWith(
      "/app/connect/youtube?sync=started",
    );
  });

  it("redirects invalid dates before authorization or mutation", async () => {
    vi.resetModules();
    const rpc = vi.fn();
    const requireViewer = vi.fn();
    const redirect = vi.fn((path: string): never => {
      throw new Error(`redirect:${path}`);
    });
    vi.doMock("server-only", () => ({}));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("next/navigation", () => ({ redirect }));
    vi.doMock("@/features/auth/require-viewer", () => ({ requireViewer }));
    vi.doMock("@/lib/supabase/server", () => ({
      createServerSupabaseClient: async () => ({ rpc }),
    }));
    const { configureChannelCommentSyncAction } = await import(
      "@/app/(product)/app/connect/youtube/actions"
    );
    const formData = new FormData();
    formData.set("startDate", "2026-02-30");

    await expect(
      configureChannelCommentSyncAction(formData),
    ).rejects.toThrow("redirect:/app/connect/youtube?error=invalid_start_date");
    expect(requireViewer).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses the membership-scoped request-now and enable RPCs", async () => {
    vi.resetModules();
    const rpc = vi.fn(async () => ({ data: {}, error: null }));
    const revalidatePath = vi.fn();
    const redirect = vi.fn((path: string): never => {
      throw new Error(`redirect:${path}`);
    });
    vi.doMock("server-only", () => ({}));
    vi.doMock("next/cache", () => ({ revalidatePath }));
    vi.doMock("next/navigation", () => ({ redirect }));
    vi.doMock("@/features/auth/require-viewer", () => ({
      requireViewer: async () => ({
        userId: "user-1",
        workspaceId: "workspace-1",
      }),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createServerSupabaseClient: async () => ({ rpc }),
    }));
    const {
      requestChannelCommentSyncNowAction,
      setChannelCommentSyncEnabledAction,
    } = await import("@/app/(product)/app/connect/youtube/actions");

    await expect(requestChannelCommentSyncNowAction()).rejects.toThrow(
      "redirect:/app/connect/youtube?sync=requested",
    );
    const formData = new FormData();
    formData.set("enabled", "false");
    await expect(
      setChannelCommentSyncEnabledAction(formData),
    ).rejects.toThrow("redirect:/app/connect/youtube?sync=paused");

    expect(rpc).toHaveBeenNthCalledWith(1, "request_channel_comment_sync_now", {
      target_workspace_id: "workspace-1",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "set_channel_comment_sync_enabled", {
      target_workspace_id: "workspace-1",
      target_enabled: false,
    });
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });
});
