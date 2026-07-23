import "server-only";

import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type Viewer = {
  userId: string;
  workspaceId: string;
};

export const requireViewer = async (): Promise<Viewer> => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/auth/sign-in");
  }

  const { data: workspaceId, error } = await supabase.rpc(
    "ensure_owner_workspace",
  );

  if (error || !workspaceId) {
    throw new Error("Workspace bootstrap failed");
  }

  return {
    userId: user.id,
    workspaceId,
  };
};
