import { NextResponse } from "next/server";
import { z } from "zod";

import { requireViewer } from "@/features/auth/require-viewer";
import { FORCE_SSL_SCOPE } from "@/features/moderation/moderation-service";
import { issueOAuthState } from "@/features/youtube/oauth-state-cookie";
import { createYouTubeProvider } from "@/features/youtube/provider-factory";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const GET = async (request: Request) => {
  const requestId = z
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("requestId"));
  if (!requestId.success) {
    return NextResponse.json(
      { error: "invalid_moderation_request" },
      { status: 400 },
    );
  }

  const { userId, workspaceId } = await requireViewer();
  const admin = createAdminSupabaseClient();
  const { data: actionRequest, error } = await admin
    .from("moderation_action_requests")
    .select("id, state")
    .eq("id", requestId.data)
    .eq("workspace_id", workspaceId)
    .eq("requested_by", userId)
    .eq("state", "awaiting_scope")
    .maybeSingle();

  if (error || !actionRequest) {
    return NextResponse.json(
      { error: "moderation_request_not_found" },
      { status: 404 },
    );
  }

  const state = await issueOAuthState({
    purpose: "moderation",
    actionRequestId: actionRequest.id,
  });
  const provider = createYouTubeProvider();

  return NextResponse.redirect(
    provider.getAuthorizationUrl({
      state,
      scopes: [FORCE_SSL_SCOPE],
      includeGrantedScopes: true,
      accessType: "offline",
      prompt: "consent",
    }),
  );
};
