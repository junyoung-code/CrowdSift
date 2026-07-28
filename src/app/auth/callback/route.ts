import { NextResponse } from "next/server";

import { getSafeNextPath } from "@/features/auth/safe-next-path";
import { getServerEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const loopbackHosts = new Set(["localhost", "127.0.0.1"]);

const getCallbackOrigin = (requestOrigin: string, appOrigin: string) => {
  const requested = new URL(requestOrigin);
  const configured = new URL(appOrigin);

  if (requested.origin === configured.origin) {
    return requested.origin;
  }

  const isMatchingLocalOrigin =
    requested.protocol === "http:" &&
    configured.protocol === "http:" &&
    requested.port === configured.port &&
    loopbackHosts.has(requested.hostname) &&
    loopbackHosts.has(configured.hostname);

  return isMatchingLocalOrigin ? requested.origin : configured.origin;
};

export const GET = async (request: Request) => {
  const requestUrl = new URL(request.url);
  const { APP_ORIGIN } = getServerEnv();
  const callbackOrigin = getCallbackOrigin(requestUrl.origin, APP_ORIGIN);
  const code = requestUrl.searchParams.get("code");
  const nextPath = getSafeNextPath(requestUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=expired", callbackOrigin),
    );
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=expired", callbackOrigin),
    );
  }

  return NextResponse.redirect(new URL(nextPath, callbackOrigin));
};
