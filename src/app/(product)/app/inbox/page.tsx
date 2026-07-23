import { ChatCircleDots, CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { requireViewer } from "@/features/auth/require-viewer";
import { CommentInbox } from "@/features/inbox/comment-inbox";
import { getInboxPage } from "@/features/inbox/inbox-query";
import { createSupabaseInboxRepository } from "@/features/inbox/supabase-inbox-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { saveCreatorCorrectionAction } from "./actions";

type InboxPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const parameters = await searchParams;
  const { workspaceId } = await requireViewer();
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

      <CommentInbox
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
        videos={(videos ?? []).map((video) => ({
          id: video.youtube_video_id,
          title: video.title,
        }))}
      />
    </div>
  );
}
