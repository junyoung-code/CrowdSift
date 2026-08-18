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
  updated_count: number;
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
    /**
     * 이미 있던 댓글인데 내용이 달라져 관찰 기록을 새로 남긴 수.
     *
     * 「중복」과 뭉치면 다시 읽어 온 보람이 화면에서 사라진다. 유튜브 상태가 처음
     * 붙던 판에서 34건이 여기 잡혔는데, 그것 없이는 아무 일도 없었던 것처럼 보였다.
     */
    updated: number;
    duplicate: number;
    failed: number;
    analyzed: number;
  };
  /**
   * 위 숫자가 어느 판의 것인지.
   *
   * 초기 수집이 끝난 뒤에도 화면은 「초기 댓글 수집 완료」를 머리에 달고 있는데,
   * 그 아래 숫자는 방금 돈 이어받기 판의 것이다. 어느 판인지 적지 않으면 초기
   * 수집이 아무것도 못 가져온 것처럼 읽힌다.
   */
  latestRunLabel: string | null;
  statusMessage: string;
  errorMessage: string | null;
  reconnectRequired: boolean;
};

/**
 * 마지막 실행이 무엇을 했는지. 화면에서 「아래 숫자는 마지막으로 ○○ 결과입니다」로
 * 이어 붙으므로 **문장에 들어가는 꼴**로 적는다.
 *
 * 같은 숫자라도 무엇을 하다 나온 것인지에 따라 뜻이 다르다. 초기 수집이 끝난 뒤에도
 * 새 댓글 확인은 계속 도는데, 그때 0 이 뜨는 것은 실패가 아니라 새 댓글이 없다는
 * 뜻이다.
 */
const runKindLabel = (kind: string) => {
  switch (kind) {
    case "backfill_recent":
      return "지난 댓글을 가져온";
    case "incremental":
      return "새 댓글을 확인한";
    case "reply_reconciliation":
      return "답글을 확인한";
    default:
      return "동기화한";
  }
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
      return "YouTube 일일 API 할당량에 도달했습니다. 다음 할당량 갱신 뒤 자동으로 다시 시도합니다.";
    case "youtube_rate_limited":
      return "YouTube 요청 속도 제한에 도달했습니다. 잠시 후 자동으로 다시 시도합니다.";
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
  pendingAnalysisCount,
  status,
}: {
  enabled: boolean;
  active: boolean;
  pendingAnalysisCount: number;
  status: ChannelSyncProgress["backfillStatus"];
  latestRun: ChannelSyncProgressRun | null;
}) => {
  if (pendingAnalysisCount > 0) {
    return "저장한 댓글을 분류하고 있습니다.";
  }
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
  pendingAnalysisCount = 0,
  setting,
}: {
  setting: ChannelSyncProgressSetting | null;
  latestRun: ChannelSyncProgressRun | null;
  pendingAnalysisCount?: number;
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
      counts: { stored: 0, updated: 0, duplicate: 0, failed: 0, analyzed: 0 },
      latestRunLabel: null,
      statusMessage: "채널 댓글 동기화를 아직 설정하지 않았습니다.",
      errorMessage: null,
      reconnectRequired: false,
    };
  }

  const status = backfillStatus(setting.backfill_status);
  const active =
    pendingAnalysisCount > 0 ||
    (setting.enabled &&
      (status === "pending" ||
        status === "running" ||
        latestRun?.status === "pending" ||
        latestRun?.status === "running"));
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
      updated: latestRun?.updated_count ?? 0,
      duplicate: latestRun?.duplicate_count ?? 0,
      failed: latestRun?.failed_count ?? 0,
      analyzed: latestRun?.analyzed_count ?? 0,
    },
    latestRunLabel: latestRun ? runKindLabel(latestRun.kind) : null,
    statusMessage: statusMessage({
      enabled: setting.enabled,
      active,
      pendingAnalysisCount,
      status,
      latestRun,
    }),
    errorMessage: errorMessage(failureCode),
    reconnectRequired: failureCode === "permission_revoked",
  };
};
