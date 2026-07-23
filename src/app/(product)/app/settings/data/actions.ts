"use server";

import { createHmac } from "node:crypto";

import { redirect } from "next/navigation";

import {
  deleteWorkspaceData,
  type WorkspaceDeletionDependencies,
} from "@/features/auth/workspace-deletion-service";
import { requireViewer } from "@/features/auth/require-viewer";
import { getServerEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type DeleteWorkspaceState =
  | {
      status: "error";
      message: string;
    }
  | undefined;

const createDeletionDependencies = (): WorkspaceDeletionDependencies => {
  const admin = createAdminSupabaseClient();
  const { DELETION_AUDIT_PEPPER } = getServerEnv();

  return {
    async verifyOwner({ userId, workspaceId }) {
      const { data, error } = await admin
        .from("workspaces")
        .select("id")
        .eq("id", workspaceId)
        .eq("owner_user_id", userId)
        .maybeSingle();

      if (error) {
        throw new Error("Workspace ownership could not be verified");
      }

      return Boolean(data);
    },
    async revokeGoogleToken(workspaceId) {
      const { data, error } = await admin
        .from("youtube_connections")
        .select("encrypted_access_token, encrypted_refresh_token")
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (error) {
        throw new Error("Google credentials could not be loaded");
      }

      if (data?.encrypted_access_token || data?.encrypted_refresh_token) {
        throw new Error("Encrypted Google token revocation is not available yet");
      }
    },
    async clearEncryptedTokens(workspaceId) {
      const { error } = await admin
        .from("youtube_connections")
        .update({
          encrypted_access_token: null,
          encrypted_refresh_token: null,
          status: "revoked",
        })
        .eq("workspace_id", workspaceId);

      if (error) {
        throw new Error("Local Google credentials could not be cleared");
      }
    },
    async insertContentFreeDeletionAudit({ actorFingerprint, workspaceId }) {
      const { error } = await admin.from("deletion_audit_logs").insert({
        deleted_workspace_id: workspaceId,
        actor_fingerprint: actorFingerprint,
        event_type: "workspace_data_deleted",
      });

      if (error) {
        throw new Error("Deletion audit could not be recorded");
      }
    },
    async deleteWorkspace(workspaceId) {
      const { error } = await admin
        .from("workspaces")
        .delete()
        .eq("id", workspaceId);

      if (error) {
        throw new Error("Workspace data could not be deleted");
      }
    },
    fingerprintActor(userId) {
      return createHmac("sha256", DELETION_AUDIT_PEPPER)
        .update(userId)
        .digest("hex");
    },
  };
};

export const deleteWorkspaceAction = async (
  _previousState: DeleteWorkspaceState,
  formData: FormData,
): Promise<DeleteWorkspaceState> => {
  const viewer = await requireViewer();

  try {
    await deleteWorkspaceData(
      {
        ...viewer,
        confirmation: String(formData.get("confirmation") ?? ""),
      },
      createDeletionDependencies(),
    );
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error &&
        error.message === "Exact deletion confirmation required"
          ? "확인 문구를 정확히 입력해 주세요."
          : "데이터를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  redirect("/?deleted=1");
};
