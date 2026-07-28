import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/types/database";

const getPublicSupabaseEnvironment = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Public Supabase environment is not configured");
  }

  return { anonKey, url };
};

export const createServerSupabaseClient = async () => {
  const cookieStore = await cookies();
  const { anonKey, url } = getPublicSupabaseEnvironment();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, options, value }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write response cookies. The proxy refreshes
          // auth cookies before protected routes reach this client.
        }
      },
    },
  });
};
