import { ArrowRight, LinkSimple, YoutubeLogo } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { requireViewer } from "@/features/auth/require-viewer";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AppOverviewPage() {
  const { workspaceId } = await requireViewer();
  const supabase = await createServerSupabaseClient();
  const { data: connection, error } = await supabase
    .from("youtube_connection_overview")
    .select("status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error("YouTube connection status could not be loaded");
  }

  return (
    <div className="overview-page">
      <div className="page-heading">
        <div>
          <p>OVERVIEW</p>
          <h1>댓글 관리 개요</h1>
          <span>
            연결된 채널과 실제로 가져온 댓글의 상태만 이 화면에 표시됩니다.
          </span>
        </div>
      </div>

      {!connection ? (
        <section className="connection-empty-state">
          <span className="empty-state-icon" aria-hidden="true">
            <YoutubeLogo weight="fill" />
          </span>
          <p>첫 번째 단계</p>
          <h2>YouTube 채널을 연결해 첫 댓글을 가져오세요</h2>
          <span>
            CommentHawk 로그인과 YouTube 권한은 별도로 관리됩니다. 먼저 읽기
            권한으로 채널과 영상을 선택합니다.
          </span>
          <Link className="button button-primary" href="/app/connect/youtube">
            YouTube 연결하기
            <ArrowRight aria-hidden="true" weight="bold" />
          </Link>
          <div className="empty-state-steps" aria-label="첫 분석 순서">
            <span>
              <strong>1</strong> 채널 연결
            </span>
            <span>
              <strong>2</strong> 영상 선택
            </span>
            <span>
              <strong>3</strong> 댓글 20–50개 가져오기
            </span>
            <span>
              <strong>4</strong> AI 분류 확인
            </span>
          </div>
        </section>
      ) : (
        <section className="connection-empty-state">
          <span className="empty-state-icon is-connected" aria-hidden="true">
            <LinkSimple weight="bold" />
          </span>
          <p>연결 상태</p>
          <h2>YouTube 계정 연결을 확인했습니다</h2>
          <span>
            사용할 채널 하나를 선택하면 영상을 불러올 수 있습니다. 아직 실제
            댓글이나 분석 수치가 없으면 빈 상태로 표시됩니다.
          </span>
          <Link className="button button-primary" href="/app/connect/youtube">
            채널 선택 계속하기
            <ArrowRight aria-hidden="true" weight="bold" />
          </Link>
        </section>
      )}
    </div>
  );
}
