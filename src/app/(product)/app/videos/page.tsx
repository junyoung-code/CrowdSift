import {
  ArrowClockwise,
  ArrowRight,
  CheckCircle,
  FilmStrip,
  Info,
  WarningCircle,
  YoutubeLogo,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { requireViewer } from "@/features/auth/require-viewer";
import { ImportProgress } from "@/features/ingestion/import-progress";
import { getImportFailureMessage } from "@/features/ingestion/video-import-contract";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import {
  importYouTubeCommentsAction,
  syncYouTubeVideosAction,
} from "./actions";

type VideoPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const getPageMessage = (
  parameters: Record<string, string | string[] | undefined>,
) => {
  switch (parameters.error) {
    case "invalid_import_request":
      return "댓글은 20개부터 50개까지 가져올 수 있습니다. 영상 하나와 수량을 다시 선택해 주세요.";
    case "video_not_owned":
      return "현재 연결한 채널의 영상만 선택할 수 있습니다.";
    case "video_sync_failed":
      return "영상 목록을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    case "job_create_failed":
      return "댓글 가져오기 작업을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
    default:
      return typeof parameters.error === "string"
        ? getImportFailureMessage(parameters.error)
        : null;
  }
};

export default async function VideosPage({ searchParams }: VideoPageProps) {
  const parameters = await searchParams;
  const { workspaceId } = await requireViewer();
  const supabase = await createServerSupabaseClient();
  const selectedJobId =
    typeof parameters.job === "string" ? parameters.job : null;
  const [
    { data: connection, error: connectionError },
    { data: selectedChannel, error: channelError },
    { data: videos, error: videosError },
    { data: jobs, error: jobsError },
  ] = await Promise.all([
    supabase
      .from("youtube_connection_overview")
      .select("status")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("youtube_channel_candidates")
      .select("youtube_channel_id, title")
      .eq("workspace_id", workspaceId)
      .eq("selected", true)
      .maybeSingle(),
    supabase
      .from("youtube_videos")
      .select(
        "youtube_video_id, title, thumbnail_url, published_at, comments_enabled",
      )
      .eq("workspace_id", workspaceId)
      .order("published_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("comment_import_jobs")
      .select(
        "id, requested_top_level_count, fetched_count, stored_count, duplicate_count, failed_count, status, last_error_code, created_at, youtube_video_id",
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (
    connectionError ||
    channelError ||
    videosError ||
    jobsError
  ) {
    throw new Error("YouTube videos could not be loaded");
  }

  const selectedJob =
    jobs?.find((job) => job.id === selectedJobId) ?? jobs?.[0] ?? null;
  const selectedJobVideo = selectedJob
    ? videos?.find(
        (video) => video.youtube_video_id === selectedJob.youtube_video_id,
      )
    : null;
  const message = getPageMessage(parameters);
  const isConnected =
    connection?.status === "connected" && Boolean(selectedChannel);

  return (
    <div className="videos-page">
      <div className="page-heading video-page-heading">
        <div>
          <p>VIDEO & COMMENT IMPORT</p>
          <h1>영상과 댓글 가져오기</h1>
          <span>
            연결한 채널에서 영상 하나를 고르고 상위 댓글 20–50개를 가져옵니다.
            각 댓글의 답글은 선택 수량과 별도로 모두 확인합니다.
          </span>
        </div>
        {isConnected ? (
          <form action={syncYouTubeVideosAction}>
            <button className="button button-secondary" type="submit">
              <ArrowClockwise aria-hidden="true" weight="bold" />
              영상 목록 새로고침
            </button>
          </form>
        ) : null}
      </div>

      {message ? (
        <p className="form-message form-message-error" role="alert">
          <WarningCircle aria-hidden="true" weight="fill" />
          {message}
        </p>
      ) : null}

      {parameters.synced ? (
        <p className="form-message form-message-success" role="status">
          <CheckCircle aria-hidden="true" weight="fill" />
          실제 YouTube 영상 목록을 새로 불러왔습니다.
        </p>
      ) : null}

      {!isConnected ? (
        <section className="video-connection-required">
          <span aria-hidden="true">
            <YoutubeLogo weight="fill" />
          </span>
          <div>
            <p>먼저 채널 연결이 필요합니다</p>
            <h2>YouTube 채널 하나를 연결하고 선택해 주세요</h2>
            <small>
              아직 연결되지 않은 상태에서는 영상이나 댓글 수치를 표시하지
              않습니다.
            </small>
          </div>
          <Link className="button button-primary" href="/app/connect/youtube">
            YouTube 연결하기
            <ArrowRight aria-hidden="true" weight="bold" />
          </Link>
        </section>
      ) : null}

      {isConnected && videos?.length === 0 ? (
        <section className="video-empty-state">
          <span aria-hidden="true">
            <FilmStrip weight="duotone" />
          </span>
          <p>연결된 채널: {selectedChannel?.title}</p>
          <h2>아직 불러온 영상이 없습니다</h2>
          <small>
            YouTube에서 실제 영상 목록을 불러온 뒤 댓글을 확인할 영상 하나를
            선택할 수 있습니다.
          </small>
          <form action={syncYouTubeVideosAction}>
            <button className="button button-primary" type="submit">
              영상 목록 불러오기
              <ArrowRight aria-hidden="true" weight="bold" />
            </button>
          </form>
        </section>
      ) : null}

      {isConnected && videos && videos.length > 0 ? (
        <form action={importYouTubeCommentsAction} className="video-import-card">
          <div className="video-import-intro">
            <div>
              <p>연결된 채널</p>
              <h2>{selectedChannel?.title}</h2>
            </div>
            <span>{videos.length}개 영상 확인됨</span>
          </div>

          <fieldset className="video-options">
            <legend>댓글을 가져올 영상 하나</legend>
            {videos.map((video, index) => (
              <label key={video.youtube_video_id}>
                <input
                  defaultChecked={index === 0}
                  name="youtubeVideoId"
                  required
                  type="radio"
                  value={video.youtube_video_id}
                />
                <span className="video-option-icon" aria-hidden="true">
                  <FilmStrip weight="duotone" />
                </span>
                <span className="video-option-copy">
                  <strong>{video.title}</strong>
                  <small>
                    {video.published_at
                      ? new Intl.DateTimeFormat("ko-KR", {
                          dateStyle: "medium",
                        }).format(new Date(video.published_at))
                      : "게시일 정보 없음"}
                  </small>
                </span>
                <span className="video-option-state">
                  {video.comments_enabled === false
                    ? "댓글 사용 중지됨"
                    : "선택 가능"}
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset className="comment-limit-options">
            <legend>가져올 상위 댓글 수</legend>
            {[20, 30, 50].map((limit) => (
              <label key={limit}>
                <input
                  defaultChecked={limit === 20}
                  name="topLevelLimit"
                  type="radio"
                  value={limit}
                />
                <span>
                  <strong>{limit}개</strong>
                  <small>답글은 별도 포함</small>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="import-explanation">
            <Info aria-hidden="true" weight="fill" />
            <p>
              가져온 원문은 변경하지 않고 보존합니다. 이 단계에서는 공개 댓글을
              읽어 저장하고 AI 분석 작업만 준비하며, 댓글을 숨기거나 삭제하지
              않습니다.
            </p>
          </div>

          <button className="button button-primary import-button" type="submit">
            실제 댓글 가져오기
            <ArrowRight aria-hidden="true" weight="bold" />
          </button>
        </form>
      ) : null}

      {selectedJob ? (
        <div className="import-result-stack">
          {selectedJobVideo ? (
            <p className="imported-video-title">
              최근 작업 영상 <strong>{selectedJobVideo.title}</strong>
            </p>
          ) : null}
          {selectedJob.last_error_code ? (
            <p className="form-message form-message-error" role="alert">
              {getImportFailureMessage(selectedJob.last_error_code)}
            </p>
          ) : null}
          <ImportProgress
            summary={{
              duplicateCount: selectedJob.duplicate_count,
              failedCount: selectedJob.failed_count,
              fetchedCount: selectedJob.fetched_count,
              requestedTopLevelCount:
                selectedJob.requested_top_level_count,
              status: selectedJob.status,
              storedCount: selectedJob.stored_count,
            }}
          />
          {selectedJob.status === "succeeded" ||
          selectedJob.status === "partially_succeeded" ? (
            <p className="analysis-queued-note">
              저장한 댓글의 AI 분석 작업이 준비되었습니다. 다음 단계에서
              안전·주의·위험 분류를 실행합니다.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
