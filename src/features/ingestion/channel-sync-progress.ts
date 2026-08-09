import { getKoreanToday } from "./channel-sync-contract";

export type ChannelSyncProgressSetting = {
  enabled: boolean;
  backfill_start_at: string;
  backfill_status: string;
  last_successful_sync_at: string | null;
  last_error_code: string | null;
};

export type ChannelSyncProgressRun = {
  kind: string;
  status: string;
  stored_count: number;
  duplicate_count: number;
  failed_count: number;
  analyzed_count: number;
  error_code: string | null;
  started_at: string | null;
  finished_at: string | null;
};

export type ChannelSyncProgress = {
  configured: boolean;
  enabled: boolean;
  active: boolean;
  startDate: string | null;
  backfillStatus:
    | "not_configured"
    | "pending"
    | "running"
    | "completed"
    | "failed";
  backfillLabel: string;
  lastSuccessfulSyncAt: string | null;
  counts: {
    stored: number;
    duplicate: number;
    failed: number;
    analyzed: number;
  };
  statusMessage: string;
  errorMessage: string | null;
};

const backfillStatus = (
  value: string,
): ChannelSyncProgress["backfillStatus"] => {
  switch (value) {
    case "pending":
    case "running":
    case "completed":
    case "failed":
      return value;
    default:
      return "failed";
  }
};

const backfillLabel = (
  status: ChannelSyncProgress["backfillStatus"],
) => {
  switch (status) {
    case "pending":
      return "초기 댓글 수집 대기";
    case "running":
      return "초기 댓글 수집 중";
    case "completed":
      return "초기 댓글 수집 완료";
    case "failed":
      return "초기 댓글 수집 실패";
    case "not_configured":
      return "시작 날짜를 선택해 주세요";
  }
};

const errorMessage = (code: string | null): string | null => {
  switch (code) {
    case null:
      return null;
    case "permission_revoked":
      return "YouTube 읽기 권한을 확인할 수 없습니다. 채널을 다시 연결해 주세요.";
    case "quota_exceeded":
      return "YouTube API 사용 한도에 도달했습니다. 잠시 후 자동으로 다시 시도합니다.";
    case "video_metadata_unavailable":
      return "영상 정보를 확인하지 못했습니다. 잠시 후 다시 시도합니다.";
    case "invalid_reply_cursor":
    case "provider_mode_mismatch":
    case "provider_error":
    default:
      return "댓글 동기화 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }
};

const statusMessage = ({
  active,
  enabled,
  latestRun,
  status,
}: {
  enabled: boolean;
  active: boolean;
  status: ChannelSyncProgress["backfillStatus"];
  latestRun: ChannelSyncProgressRun | null;
}) => {
  if (!enabled) return "자동 동기화를 일시중지했습니다.";
  if (active && status !== "completed") {
    return "선택한 날짜까지 댓글을 가져오고 있습니다.";
  }
  if (latestRun?.status === "running" || latestRun?.status === "pending") {
    return "새 댓글을 확인하고 있습니다.";
  }
  if (status === "failed" || latestRun?.status === "failed") {
    return "댓글 동기화를 완료하지 못했습니다.";
  }
  return "채널의 새 댓글을 자동으로 확인합니다.";
};

export const toChannelSyncProgress = ({
  latestRun,
  setting,
}: {
  setting: ChannelSyncProgressSetting | null;
  latestRun: ChannelSyncProgressRun | null;
}): ChannelSyncProgress => {
  if (!setting) {
    return {
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
    };
  }

  const status = backfillStatus(setting.backfill_status);
  const active =
    setting.enabled &&
    (status === "pending" ||
      status === "running" ||
      latestRun?.status === "pending" ||
      latestRun?.status === "running");
  const failureCode = latestRun?.error_code ?? setting.last_error_code;

  return {
    configured: true,
    enabled: setting.enabled,
    active,
    startDate: getKoreanToday(new Date(setting.backfill_start_at)),
    backfillStatus: status,
    backfillLabel: backfillLabel(status),
    lastSuccessfulSyncAt: setting.last_successful_sync_at,
    counts: {
      stored: latestRun?.stored_count ?? 0,
      duplicate: latestRun?.duplicate_count ?? 0,
      failed: latestRun?.failed_count ?? 0,
      analyzed: latestRun?.analyzed_count ?? 0,
    },
    statusMessage: statusMessage({
      enabled: setting.enabled,
      active,
      status,
      latestRun,
    }),
    errorMessage: errorMessage(failureCode),
  };
};
