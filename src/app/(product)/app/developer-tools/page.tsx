import { requireDeveloperToolsViewer } from "@/features/developer-tools/require-developer-tools-viewer";
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
      : await supabase.from("comment_import_jobs").select("id")
          .eq("workspace_id", workspaceId).eq("source_kind", "public_url")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (restoredPublicJobError) {
    throw new Error("Public import job could not be restored");
  }

  return (
      <PublicVideoImportPanel
        initialJobId={restoredPublicJob?.id ?? null}
        mode={publicMode}
        previewAction={previewPublicVideoAction}
        startAction={startPublicVideoImportAction}
      />
  );
}
