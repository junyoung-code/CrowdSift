import { NextResponse } from "next/server";

import { requireViewer } from "@/features/auth/require-viewer";
import { issueOAuthState } from "@/features/youtube/oauth-state-cookie";
import { createYouTubeProvider } from "@/features/youtube/provider-factory";

const YOUTUBE_READ_SCOPE =
  "https://www.googleapis.com/auth/youtube.readonly";

export const GET = async () => {
  await requireViewer();

  const state = await issueOAuthState({ purpose: "read" });
  const provider = createYouTubeProvider();

  return NextResponse.redirect(
    provider.getAuthorizationUrl({
      state,
      scopes: [YOUTUBE_READ_SCOPE],
      includeGrantedScopes: true,
      accessType: "offline",
      prompt: "consent",
    }),
  );
};
