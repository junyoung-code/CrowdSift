"use client";

import { useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function GoogleSignInButton({ nextPath }: { nextPath: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const signIn = async () => {
    setPending(true);
    setError(null);

    try {
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("next", nextPath);
      const supabase = createBrowserSupabaseClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callback.toString(),
        },
      });

      if (!authError) return;
    } catch {
      // Keep provider and transport details out of the browser UI.
    }

    setPending(false);
    setError("Google 로그인을 시작하지 못했습니다. 다시 시도해 주세요.");
  };

  return (
    <div className="google-sign-in">
      <button
        className="button button-google"
        disabled={pending}
        onClick={signIn}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path
            d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.55h3.24c1.9-1.75 2.98-4.33 2.98-7.42Z"
            fill="#4285F4"
          />
          <path
            d="M12 22c2.7 0 4.97-.9 6.63-2.42l-3.24-2.55c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.63A10 10 0 0 0 12 22Z"
            fill="#34A853"
          />
          <path
            d="M6.39 13.86A6 6 0 0 1 6.08 12c0-.65.11-1.28.31-1.86V7.5H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.5l3.35-2.64Z"
            fill="#FBBC05"
          />
          <path
            d="M12 6.01c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.5l3.35 2.64C7.18 7.77 9.39 6 12 6Z"
            fill="#EA4335"
          />
        </svg>
        {pending ? "Google로 이동 중…" : "Google로 계속하기"}
      </button>
      {error ? (
        <p className="form-message form-message-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
