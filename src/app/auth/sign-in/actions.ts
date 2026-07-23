"use server";

import { z } from "zod";

import { getServerEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const signInSchema = z.object({
  email: z.email(),
});

export type SignInState =
  | {
      status: "error" | "success";
      message: string;
    }
  | undefined;

export const requestMagicLink = async (
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> => {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "올바른 이메일 주소를 입력해 주세요.",
    };
  }

  const { APP_ORIGIN } = getServerEnv();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${APP_ORIGIN}/auth/callback?next=/app`,
    },
  });

  if (error) {
    return {
      status: "error",
      message: "로그인 링크를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  return {
    status: "success",
    message: "로그인 링크를 이메일로 보냈습니다.",
  };
};
