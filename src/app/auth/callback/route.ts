import { NextResponse } from "next/server";

import { getSafeNextPath } from "@/features/auth/safe-next-path";
import { getServerEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const GET = async (request: Request) => {
  const requestUrl = new URL(request.url);
  const { APP_ORIGIN } = getServerEnv();
  const code = requestUrl.searchParams.get("code");
  const nextPath = getSafeNextPath(requestUrl.searchParams.get("next"));

  if (!code) {
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

  return NextResponse.redirect(new URL(nextPath, APP_ORIGIN));
};
