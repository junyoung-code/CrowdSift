import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const getSafeNextUrl = (value: string | null, appOrigin: string) => {
  const fallback = new URL("/app", appOrigin);

  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001F\u007F]/.test(value)
  ) {
    return fallback;
  }

  try {
    const destination = new URL(value, appOrigin);
    return destination.origin === fallback.origin ? destination : fallback;
  } catch {
    return fallback;
  }
};

export const GET = async (request: Request) => {
  const requestUrl = new URL(request.url);
  const { APP_ORIGIN } = getServerEnv();
  const code = requestUrl.searchParams.get("code");
  const next = getSafeNextUrl(requestUrl.searchParams.get("next"), APP_ORIGIN);

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

  return NextResponse.redirect(next);
};
