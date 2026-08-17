import {
  ArrowRight,
  CheckCircle,
  LinkBreak,
  ShieldCheck,
  YoutubeLogo,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { requireViewer } from "@/features/auth/require-viewer";
import { getKoreanToday } from "@/features/ingestion/channel-sync-contract";
import {
  ChannelSyncProgressPanel,
  ChannelSyncSetup,
} from "@/features/ingestion/channel-sync-progress-panel";
import { toChannelSyncProgress } from "@/features/ingestion/channel-sync-progress";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import {
  configureChannelCommentSyncAction,
  disconnectYouTubeChannelAction,
  requestChannelCommentSyncNowAction,
  selectYouTubeChannelAction,
  setChannelCommentSyncEnabledAction,
} from "./actions";

type YouTubeConnectionPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const getErrorMessage = (
  parameters: Record<string, string | string[] | undefined>,
) => {
  switch (parameters.error) {
    case "invalid_start_date":
      return "오늘 또는 그 이전의 올바른 시작 날짜를 선택해 주세요.";
    case "sync_configuration_failed":
      return "댓글 동기화 시작 날짜를 저장하지 못했습니다. 다시 시도해 주세요.";
    case "sync_request_failed":
      return "댓글 동기화를 요청하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    case "sync_toggle_invalid":
    case "sync_toggle_failed":
      return "자동 동기화 상태를 변경하지 못했습니다. 다시 시도해 주세요.";
    case "channel_required":
      return "사용할 채널 하나를 선택해 주세요.";
    case "revoke_failed":
      return "Google 권한을 해제하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    case "invalid_callback":
    case "invalid_state":
    case "missing_code":
    case "oauth_failed":
      return "YouTube 연결을 완료하지 못했습니다. 다시 연결해 주세요.";
    default:
      return parameters.error
        ? "요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요."
        : null;
  }
};

export default async function YouTubeConnectionPage({
  searchParams,
}: YouTubeConnectionPageProps) {
  const parameters = await searchParams;
  const { workspaceId } = await requireViewer();
  const supabase = await createServerSupabaseClient();
  const [
    { data: connection, error: connectionError },
    { data: candidates, error: candidatesError },
    { data: syncSetting, error: syncSettingError },
  ] = await Promise.all([
    supabase
      .from("youtube_connection_overview")
      .select("id, status, granted_scopes, updated_at")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("youtube_channel_candidates")
      .select("youtube_channel_id, title, handle, thumbnail_url, selected")
      .eq("workspace_id", workspaceId)
      .order("title"),
    supabase
      .from("channel_comment_sync_settings")
      .select(
        "id, enabled, backfill_start_at, backfill_status, last_successful_sync_at, last_error_code",
      )
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);

  if (connectionError || candidatesError || syncSettingError) {
    throw new Error("YouTube connection could not be loaded");
  }

  const { data: latestSyncRun, error: latestSyncRunError } = syncSetting
    ? await supabase
        .from("channel_comment_sync_runs")
        .select(
          "kind, status, stored_count, updated_count, duplicate_count, failed_count, analyzed_count, error_code, started_at, finished_at",
        )
        .eq("workspace_id", workspaceId)
        .eq("setting_id", syncSetting.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null, error: null };

  if (latestSyncRunError) {
    throw new Error("YouTube sync progress could not be loaded");
  }

  const selectedChannel = candidates?.find((candidate) => candidate.selected);
  const syncProgress = toChannelSyncProgress({
    setting: syncSetting,
    latestRun: latestSyncRun,
  });
  const errorMessage = getErrorMessage(parameters);
  const isDisconnected =
    !connection ||
    connection.status === "disconnected" ||
    connection.status === "revoked";

  return (
    <div className="youtube-connection-page">
      <div className="page-heading">
        <div>
          <p>YOUTUBE CONNECTION</p>
          <h1>YouTube 채널 연결</h1>
          <span>
            CrowdSift 로그인과 별도로, 크리에이터가 소유한 채널의 읽기 권한을
            연결합니다.
          </span>
        </div>
      </div>

      {errorMessage ? (
        <p className="form-message form-message-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {parameters.connected || parameters.selected || parameters.sync ? (
        <p className="form-message form-message-success" role="status">
          {parameters.sync
            ? "댓글 동기화 설정을 저장했습니다."
            : "YouTube 연결 상태를 저장했습니다."}
        </p>
      ) : null}

      {isDisconnected ? (
        <section className="youtube-connect-card">
          <span className="youtube-connect-icon" aria-hidden="true">
            <YoutubeLogo weight="fill" />
          </span>
          <div>
            <p>읽기 권한부터 시작합니다</p>
            <h2>내 YouTube 채널을 연결하세요</h2>
            <span>
              채널과 영상 목록, 선택한 영상의 공개 댓글을 가져오기 위한 최소
              권한만 요청합니다. 실제 댓글 숨김 권한은 지금 요청하지 않습니다.
            </span>
          </div>
          <Link
            className="button button-primary"
            href="/api/youtube/oauth/start"
          >
            Google에서 연결하기
            <ArrowRight aria-hidden="true" weight="bold" />
          </Link>
          <div className="permission-note">
            <ShieldCheck aria-hidden="true" weight="duotone" />
            <span>
              OAuth token은 서버에서 AES-256-GCM으로 암호화되며 브라우저에
              노출되지 않습니다.
            </span>
          </div>
        </section>
      ) : null}

      {connection?.status === "pending_channel_selection" &&
      candidates &&
      candidates.length > 1 ? (
        <section className="channel-selection-card">
          <div>
            <p>채널 선택</p>
            <h2>관리할 채널 하나를 선택하세요</h2>
            <span>
              하나의 CrowdSift workspace에는 한 번에 채널 하나만 연결합니다.
            </span>
          </div>
          <form action={selectYouTubeChannelAction}>
            <fieldset className="channel-options">
              <legend className="sr-only">YouTube 채널 후보</legend>
              {candidates.map((candidate) => (
                <label key={candidate.youtube_channel_id}>
                  <input
                    type="radio"
                    name="channelId"
                    value={candidate.youtube_channel_id}
                    required
                  />
                  <span className="channel-avatar" aria-hidden="true">
                    {candidate.title.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>{candidate.title}</strong>
                    <small>{candidate.handle ?? "YouTube 채널"}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <button className="button button-primary" type="submit">
              이 채널 사용하기
              <ArrowRight aria-hidden="true" weight="bold" />
            </button>
          </form>
        </section>
      ) : null}

      {connection?.status === "connected" && selectedChannel ? (
        <section className="connected-channel-card">
          <div className="connected-channel-summary">
            <span className="connected-check" aria-hidden="true">
              <CheckCircle weight="fill" />
            </span>
            <div>
              <p>연결된 채널</p>
              <h2>{selectedChannel.title}</h2>
              <span>{selectedChannel.handle ?? "YouTube 채널"}</span>
            </div>
          </div>
          <div className="connection-next-step">
            {syncProgress.configured ? (
              <ChannelSyncProgressPanel
                initialProgress={syncProgress}
                key={JSON.stringify(syncProgress)}
                requestNowAction={requestChannelCommentSyncNowAction}
                setEnabledAction={setChannelCommentSyncEnabledAction}
              />
            ) : (
              <ChannelSyncSetup
                configureAction={configureChannelCommentSyncAction}
                maxDate={getKoreanToday()}
              />
            )}
          </div>
          <form action={disconnectYouTubeChannelAction} className="disconnect-box">
            <div>
              <strong>연결 해제</strong>
              <p>
                Google token을 해제하고 로컬 암호화 token을 삭제합니다. 이미
                수집한 댓글 원문과 분석 기록은 삭제하지 않습니다.
              </p>
            </div>
            <button className="disconnect-button" type="submit">
              <LinkBreak aria-hidden="true" weight="bold" />
              YouTube 연결 해제
            </button>
          </form>
        </section>
      ) : null}

      {connection?.status === "error" ? (
        <section className="youtube-connect-card">
          <span className="youtube-connect-icon" aria-hidden="true">
            <YoutubeLogo weight="fill" />
          </span>
          <div>
            <p>채널을 찾지 못했습니다</p>
            <h2>소유한 YouTube 채널이 있는 Google 계정으로 다시 연결하세요</h2>
          </div>
          <Link
            className="button button-primary"
            href="/api/youtube/oauth/start"
          >
            다시 연결하기
          </Link>
        </section>
      ) : null}

    </div>
  );
}
