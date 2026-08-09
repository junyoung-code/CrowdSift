"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireViewer } from "@/features/auth/require-viewer";
import { parseChannelSyncStartDate } from "@/features/ingestion/channel-sync-contract";
import {
  selectChannel,
  type ChannelSelectionRepository,
} from "@/features/youtube/channel-service";
import { createYouTubeProvider } from "@/features/youtube/provider-factory";
import { decryptToken } from "@/features/youtube/token-crypto";
import { getServerEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const channelSelectionSchema = z.string().min(1);
const enabledSchema = z.enum(["true", "false"]).transform((value) =>
  value === "true",
);

const CONNECT_YOUTUBE_PATH = "/app/connect/youtube";

export async function configureChannelCommentSyncAction(formData: FormData) {
  let startDate: string;
  try {
    startDate = parseChannelSyncStartDate(formData.get("startDate"));
  } catch {
    redirect(`${CONNECT_YOUTUBE_PATH}?error=invalid_start_date`);
  }

  const { workspaceId } = await requireViewer();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("configure_channel_comment_sync", {
    target_workspace_id: workspaceId,
    target_start_date: startDate,
  });

  if (error) {
    redirect(`${CONNECT_YOUTUBE_PATH}?error=sync_configuration_failed`);
  }

  revalidatePath(CONNECT_YOUTUBE_PATH);
  redirect(`${CONNECT_YOUTUBE_PATH}?sync=started`);
}

export async function requestChannelCommentSyncNowAction() {
  const { workspaceId } = await requireViewer();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("request_channel_comment_sync_now", {
    target_workspace_id: workspaceId,
  });

  if (error) {
    redirect(`${CONNECT_YOUTUBE_PATH}?error=sync_request_failed`);
  }

  revalidatePath(CONNECT_YOUTUBE_PATH);
  redirect(`${CONNECT_YOUTUBE_PATH}?sync=requested`);
}

export async function setChannelCommentSyncEnabledAction(formData: FormData) {
  const parsed = enabledSchema.safeParse(formData.get("enabled"));
  if (!parsed.success) {
    redirect(`${CONNECT_YOUTUBE_PATH}?error=sync_toggle_invalid`);
  }

  const { workspaceId } = await requireViewer();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_channel_comment_sync_enabled", {
    target_workspace_id: workspaceId,
    target_enabled: parsed.data,
  });

  if (error) {
    redirect(`${CONNECT_YOUTUBE_PATH}?error=sync_toggle_failed`);
  }

  revalidatePath(CONNECT_YOUTUBE_PATH);
  redirect(
    `${CONNECT_YOUTUBE_PATH}?sync=${parsed.data ? "enabled" : "paused"}`,
  );
}

export const selectYouTubeChannelAction = async (formData: FormData) => {
  const parsed = channelSelectionSchema.safeParse(formData.get("channelId"));

  if (!parsed.success) {
    redirect("/app/connect/youtube?error=channel_required");
  }

  const { workspaceId } = await requireViewer();
  const supabase = await createServerSupabaseClient();
  const repository: ChannelSelectionRepository = {
    async selectOnly(targetWorkspaceId, channelId) {
      const { error } = await supabase.rpc("select_youtube_channel", {
        target_workspace_id: targetWorkspaceId,
        target_channel_id: channelId,
      });

      if (error) {
        throw new Error("YouTube channel could not be selected");
      }
    },
  };

  try {
    await selectChannel({
      workspaceId,
      channelId: parsed.data,
      repository,
    });
  } catch {
    redirect("/app/connect/youtube?error=channel_selection_failed");
  }

  revalidatePath("/app/connect/youtube");
  redirect("/app/connect/youtube?selected=1");
};

export const disconnectYouTubeChannelAction = async () => {
  const { workspaceId } = await requireViewer();
  const environment = getServerEnv();
  const encryptionKey = Buffer.from(
    environment.YOUTUBE_TOKEN_ENCRYPTION_KEY,
    "base64",
  );
  const admin = createAdminSupabaseClient();
  const { data: connection, error: connectionError } = await admin
    .from("youtube_connections")
    .select("encrypted_access_token, encrypted_refresh_token")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (connectionError) {
    redirect("/app/connect/youtube?error=disconnect_failed");
  }

  const sealedToken =
    connection?.encrypted_refresh_token ?? connection?.encrypted_access_token;

  if (sealedToken) {
    try {
      await createYouTubeProvider().revokeToken(
        decryptToken(sealedToken, encryptionKey),
      );
    } catch {
      redirect("/app/connect/youtube?error=revoke_failed");
    }
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("disconnect_youtube_channel", {
    target_workspace_id: workspaceId,
  });

  if (error) {
    redirect("/app/connect/youtube?error=disconnect_failed");
  }

  revalidatePath("/app/connect/youtube");
  redirect("/app/connect/youtube?disconnected=1");
};
