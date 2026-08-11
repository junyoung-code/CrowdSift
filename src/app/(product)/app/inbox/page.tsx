import { ChatCircleDots, CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { requireViewer } from "@/features/auth/require-viewer";
import { CommentInbox } from "@/features/inbox/comment-inbox";
import { getInboxPage } from "@/features/inbox/inbox-query";
import { createSupabaseInboxRepository } from "@/features/inbox/supabase-inbox-repository";
import type {
  ModerationAction,
  ModerationRequestState,
} from "@/features/moderation/contracts";
import { ModerationDialog } from "@/features/moderation/moderation-dialog";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import {
  allowChannelExpressionAction,
  saveCreatorCorrectionAction,
} from "./actions";
import {
  confirmYouTubeModerationAction,
  requestYouTubeModerationAction,
} from "./moderation-actions";

type InboxPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const parameters = await searchParams;
  const { userId, workspaceId } = await requireViewer();
  const supabase = await createServerSupabaseClient();
  const repository = createSupabaseInboxRepository({
    rpc: (name, input) => supabase.rpc(name, input),
  });
  const [{ data: videos, error: videosError }, inbox] = await Promise.all([
    supabase
      .from("youtube_videos")
      .select("youtube_video_id, title")
      .eq("workspace_id", workspaceId)
      .order("published_at", { ascending: false, nullsFirst: false }),
    getInboxPage(
      {
        workspaceId,
        searchParams: parameters,
      },
      repository,
    ),
  ]);

  if (videosError) {
    throw new Error("Inbox videos could not be loaded");
  }

  const moderationId =
    typeof parameters.moderation === "string"
      ? parameters.moderation
      : null;
  let moderationRequest = null;

  if (moderationId) {
    const { data: request, error: requestError } = await supabase
      .from("moderation_action_requests")
      .select("id, raw_comment_id, action, state")
      .eq("id", moderationId)
      .eq("workspace_id", workspaceId)
      .eq("requested_by", userId)
      .maybeSingle();

    if (requestError) {
      throw new Error("Moderation request could not be loaded");
    }

    if (
      request &&
      (request.state === "awaiting_scope" ||
        request.state === "pending_confirmation" ||
        request.state === "running")
    ) {
      const { data: rawComment, error: rawError } = await supabase
        .from("raw_comments")
        .select("youtube_comment_id")
        .eq("id", request.raw_comment_id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (rawError || !rawComment) {
        throw rawError ?? new Error("Moderation comment could not be loaded");
      }

      moderationRequest = {
        requestId: request.id,
        youtubeCommentId: rawComment.youtube_comment_id,
        action: request.action as ModerationAction,
        state: request.state as ModerationRequestState,
      };
    }
  }

  return (
    <div className="inbox-page">
      <div className="page-heading inbox-page-heading">
        <div>
          <p>COMMENT REVIEW</p>
          <h1>Comment Inbox</h1>
          <span>
            AI가 순화한 내용을 먼저 보고, 기본적으로 주의·위험 댓글을
            검토합니다. 원문은 경고를 확인한 뒤에만 불러옵니다.
          </span>
        </div>
        <div className="inbox-heading-mark" aria-hidden="true">
          <ChatCircleDots weight="duotone" />
        </div>
      </div>

      {parameters.feedback === "saved" ? (
        <p className="form-message form-message-success" role="status">
          <CheckCircle aria-hidden="true" weight="fill" />
          수정한 판단과 동의 설정을 별도 피드백으로 저장했습니다.
        </p>
      ) : null}

      {parameters.error ? (
        <p className="form-message form-message-error" role="alert">
          <WarningCircle aria-hidden="true" weight="fill" />
          {parameters.error === "invalid_feedback"
            ? "수정 내용을 확인해 주세요."
            : "수정 내용을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."}
        </p>
      ) : null}

      {parameters.moderationResult === "succeeded" ? (
        <p className="form-message form-message-success" role="status">
          <CheckCircle aria-hidden="true" weight="fill" />
          요청한 YouTube 댓글 조치를 완료했습니다.
        </p>
      ) : null}

      {parameters.moderationResult === "failed" ||
      parameters.moderationError ? (
        <p className="form-message form-message-error" role="alert">
          <WarningCircle aria-hidden="true" weight="fill" />
          {parameters.moderationError === "confirmation_required"
            ? "조치 결과와 되돌림 제약을 확인해 주세요."
            : parameters.moderationError === "invalid_request"
              ? "선택한 댓글 조치를 확인해 주세요."
              : parameters.moderationError === "provider_result_unknown"
                ? "YouTube에는 조치가 반영되었을 수 있습니다. 같은 조치를 다시 실행하지 말고 YouTube Studio에서 해당 댓글 상태를 확인해 주세요."
              : "YouTube 댓글 조치를 완료하지 못했습니다. 연결 상태와 권한을 확인해 주세요."}
        </p>
      ) : null}

      {moderationRequest ? (
        <ModerationDialog
          confirmAction={confirmYouTubeModerationAction}
          dismissHref="/app/inbox"
          request={moderationRequest}
        />
      ) : null}

      <CommentInbox
        allowExpressionAction={allowChannelExpressionAction}
        correctionAction={saveCreatorCorrectionAction}
        data={{ items: inbox.items, total: inbox.total }}
        filters={{
          reviewLevels: inbox.filters.reviewLevels,
          category: inbox.filters.category,
          videoId: inbox.filters.videoId,
          analysisState: inbox.filters.analysisState,
          actionState: inbox.filters.actionState,
          minConfidence: inbox.filters.minConfidence,
          maxConfidence: inbox.filters.maxConfidence,
          search: inbox.filters.search,
          limit: inbox.filters.limit,
          offset: inbox.filters.offset,
        }}
        moderationAction={requestYouTubeModerationAction}
        selectedCommentId={
          typeof parameters.selected === "string"
            ? parameters.selected.slice(0, 128)
            : null
        }
        videos={(videos ?? []).map((video) => ({
          id: video.youtube_video_id,
          title: video.title,
        }))}
      />
    </div>
  );
}
