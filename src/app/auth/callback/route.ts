import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const getSafeNextPath = (value: string | null) =>
  value?.startsWith("/") && !value.startsWith("//") ? value : "/app";

export const GET = async (request: Request) => {
  const requestUrl = new URL(request.url);
  const { APP_ORIGIN } = getServerEnv();
  const origin = new URL(APP_ORIGIN).origin;
  const code = requestUrl.searchParams.get("code");
  const next = getSafeNextPath(requestUrl.searchParams.get("next"));

  if (!code || requestUrl.origin !== origin) {
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=expired", APP_ORIGIN),
    );
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=expired", APP_ORIGIN),
    );
  }

  return NextResponse.redirect(new URL(next, APP_ORIGIN));
};
