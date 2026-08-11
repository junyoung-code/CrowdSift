import { Info } from "@phosphor-icons/react/dist/ssr";

import { requireDeveloperToolsViewer } from "@/features/developer-tools/require-developer-tools-viewer";
import { OwnedVideoTestPanel } from "@/features/developer-tools/owned-video-test-panel";
import { getPublicYouTubeDevMode } from "@/features/youtube/public-dev-mode";
import { PublicVideoImportPanel } from "@/features/youtube/public-video-import-panel";
import { getServerEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import {
  previewPublicVideoAction,
  startPublicVideoImportAction,
} from "../connect/youtube/public-video-actions";

type DeveloperToolsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DeveloperToolsPage({
  searchParams,
}: DeveloperToolsPageProps) {
  const parameters = await searchParams;
  const { workspaceId } = await requireDeveloperToolsViewer();
  const environment = getServerEnv();
  const publicMode = getPublicYouTubeDevMode({
    NODE_ENV: process.env.NODE_ENV,
    ENABLE_PUBLIC_YOUTUBE_DEV_MODE:
      environment.ENABLE_PUBLIC_YOUTUBE_DEV_MODE,
    YOUTUBE_PUBLIC_API_KEY: environment.YOUTUBE_PUBLIC_API_KEY,
    EXTERNAL_PROVIDER_MODE: environment.EXTERNAL_PROVIDER_MODE,
    ALLOW_FIXTURE_PROVIDERS: environment.ALLOW_FIXTURE_PROVIDERS,
  });
  const requestedPublicJobId =
    typeof parameters.job === "string" ? parameters.job : null;
  const supabase = await createServerSupabaseClient();
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

  return (
    <div className="developer-tools-page">
      <div className="page-heading">
        <div>
          <p>DEVELOPER TOOLS</p>
          <h1>댓글 분류 테스트</h1>
          <span>
            수동 수집과 Classification V1 저장 경로를 개발 환경에서
            검증합니다.
          </span>
        </div>
      </div>

      <div className="import-explanation">
        <Info aria-hidden="true" weight="fill" />
        <p>
          가져온 댓글과 분석 결과는 현재 workspace의 Comment Inbox에
          저장됩니다.
        </p>
      </div>

      <OwnedVideoTestPanel
        parameters={parameters}
        workspaceId={workspaceId}
      />

      <PublicVideoImportPanel
        initialJobId={restoredPublicJob?.id ?? null}
        mode={publicMode}
        previewAction={previewPublicVideoAction}
        startAction={startPublicVideoImportAction}
      />
    </div>
  );
}
