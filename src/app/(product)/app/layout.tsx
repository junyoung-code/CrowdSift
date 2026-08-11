import type { ReactNode } from "react";

import { AppShell } from "@/features/app-shell/app-shell";
import { requireViewer } from "@/features/auth/require-viewer";
import { hasDeveloperToolsAccess } from "@/features/developer-tools/developer-tools-access";
import { getServerEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function ProductLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { userId, workspaceId } = await requireViewer();
  const environment = getServerEnv();
  const supabase = await createServerSupabaseClient();
  const { data: persistedFixtureJob, error: fixtureJobError } =
    await supabase
      .from("comment_import_jobs")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("provider_mode", "fixture")
      .limit(1)
      .maybeSingle();

  if (fixtureJobError) {
    throw fixtureJobError;
  }
  const fixtureMode =
    Boolean(persistedFixtureJob) ||
    (process.env.NODE_ENV !== "production" &&
      environment.EXTERNAL_PROVIDER_MODE === "fixture" &&
      environment.ALLOW_FIXTURE_PROVIDERS);
  const developerToolsEnabled = hasDeveloperToolsAccess({
    allowedUserIds: environment.DEVELOPER_USER_IDS,
    enabled: environment.ENABLE_DEVELOPER_TOOLS,
    nodeEnv: process.env.NODE_ENV,
    userId,
  });

  return (
    <AppShell
      developerToolsEnabled={developerToolsEnabled}
      fixtureMode={fixtureMode}
    >
      {children}
    </AppShell>
  );
}
