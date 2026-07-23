import "server-only";

import { cookies } from "next/headers";

import {
  createOAuthStatePayload,
  type OAuthStatePurpose,
  verifyOAuthStatePayload,
} from "./oauth-state";

const OAUTH_STATE_COOKIE = "commenthawk_youtube_oauth_state";
const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

export const issueOAuthState = async ({
  actionRequestId,
  purpose,
}: {
  purpose: OAuthStatePurpose;
  actionRequestId?: string | null;
}) => {
  const issued = createOAuthStatePayload({ purpose, actionRequestId });
  const cookieStore = await cookies();

  cookieStore.set(OAUTH_STATE_COOKIE, issued.cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    path: "/",
  });

  return issued.state;
};

export const consumeOAuthState = async (receivedState: string) => {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE);

  if (!cookieValue) {
    throw new Error("Missing OAuth state");
  }

  return verifyOAuthStatePayload({
    cookieValue,
    receivedState,
  });
};
