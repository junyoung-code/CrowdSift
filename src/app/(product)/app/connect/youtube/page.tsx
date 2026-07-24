import {
  ArrowRight,
  CheckCircle,
  LinkBreak,
  ShieldCheck,
  YoutubeLogo,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { requireViewer } from "@/features/auth/require-viewer";
import { getPublicYouTubeDevMode } from "@/features/youtube/public-dev-mode";
import { PublicVideoImportPanel } from "@/features/youtube/public-video-import-panel";
import { getServerEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import {
  disconnectYouTubeChannelAction,
  selectYouTubeChannelAction,
} from "./actions";
import {
  previewPublicVideoAction,
  startPublicVideoImportAction,
} from "./public-video-actions";

type YouTubeConnectionPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const getErrorMessage = (
  parameters: Record<string, string | string[] | undefined>,
) => {
  switch (parameters.error) {
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
  const environment = getServerEnv();
  const publicMode = getPublicYouTubeDevMode({
    NODE_ENV: process.env.NODE_ENV,
    ENABLE_PUBLIC_YOUTUBE_DEV_MODE:
      environment.ENABLE_PUBLIC_YOUTUBE_DEV_MODE,
    YOUTUBE_PUBLIC_API_KEY: environment.YOUTUBE_PUBLIC_API_KEY,
  });
  const supabase = await createServerSupabaseClient();
  const [
    { data: connection, error: connectionError },
    { data: candidates, error: candidatesError },
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
  ]);

  if (connectionError || candidatesError) {
    throw new Error("YouTube connection could not be loaded");
  }

  const requestedPublicJobId =
    typeof parameters.job === "string" ? parameters.job : null;
  const { data: restoredPublicJob, error: restoredPublicJobError } =
    requestedPublicJobId
      ? await supabase
          .from("comment_import_jobs")
          .select("id")
          .eq("id", requestedPublicJobId)
          .eq("workspace_id", workspaceId)
          .eq("source_kind", "public_url")
          .maybeSingle()
      : { data: null, error: null };

  if (restoredPublicJobError) {
    throw new Error("Public import job could not be restored");
  }

  const selectedChannel = candidates?.find((candidate) => candidate.selected);
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
            CommentHawk 로그인과 별도로, 크리에이터가 소유한 채널의 읽기 권한을
            연결합니다.
          </span>
        </div>
      </div>

      {errorMessage ? (
        <p className="form-message form-message-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {parameters.connected || parameters.selected ? (
        <p className="form-message form-message-success" role="status">
          YouTube 연결 상태를 저장했습니다.
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
              하나의 CommentHawk workspace에는 한 번에 채널 하나만 연결합니다.
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
            <strong>다음 단계</strong>
            <p>이 채널의 영상 목록을 불러와 댓글을 분석할 영상 하나를 선택합니다.</p>
            <Link className="button button-primary" href="/app/videos">
              영상 선택하기
              <ArrowRight aria-hidden="true" weight="bold" />
            </Link>
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

      <PublicVideoImportPanel
        initialJobId={restoredPublicJob?.id ?? null}
        mode={publicMode}
        previewAction={previewPublicVideoAction}
        startAction={startPublicVideoImportAction}
      />
    </div>
  );
}
