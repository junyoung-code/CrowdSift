"use client";

import { SignOut } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const signOut = async () => {
    setPending(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const { error: authError } = await supabase.auth.signOut();
    if (authError) {
      setPending(false);
      setError("로그아웃하지 못했습니다. 다시 시도해 주세요.");
      return;
    }

    router.replace("/auth/sign-in");
    router.refresh();
  };

  return (
    <div className="sign-out-control">
      <button disabled={pending} onClick={signOut} type="button">
        <SignOut aria-hidden="true" weight="bold" />
        {pending ? "로그아웃 중…" : "로그아웃"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
