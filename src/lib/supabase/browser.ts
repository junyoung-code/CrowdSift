"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

const getPublicSupabaseEnvironment = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Public Supabase environment is not configured");
  }

  return { anonKey, url };
};

export const createBrowserSupabaseClient = () => {
  const { anonKey, url } = getPublicSupabaseEnvironment();

  return createBrowserClient<Database>(url, anonKey);
};
