export const WORKSPACE_DELETION_CONFIRMATION = "CROWDSIFT 데이터 삭제";

export type WorkspaceDeletionInput = {
  userId: string;
  workspaceId: string;
  confirmation: string;
};

export type WorkspaceDeletionDependencies = {
  verifyOwner(input: {
    userId: string;
    workspaceId: string;
  }): Promise<boolean>;
  revokeGoogleToken(workspaceId: string): Promise<void>;
  clearEncryptedTokens(workspaceId: string): Promise<void>;
  insertContentFreeDeletionAudit(input: {
    workspaceId: string;
    actorFingerprint: string;
  }): Promise<void>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  fingerprintActor(userId: string): string;
};

export const deleteWorkspaceData = async (
  input: WorkspaceDeletionInput,
  dependencies: WorkspaceDeletionDependencies,
) => {
  if (input.confirmation !== WORKSPACE_DELETION_CONFIRMATION) {
    throw new Error("Exact deletion confirmation required");
  }

  const isOwner = await dependencies.verifyOwner({
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  if (!isOwner) {
    throw new Error("Workspace owner required");
  }

  try {
    await dependencies.revokeGoogleToken(input.workspaceId);
  } catch {
    // Google revocation is best-effort. Local credentials are cleared next.
  }

  await dependencies.clearEncryptedTokens(input.workspaceId);
  await dependencies.insertContentFreeDeletionAudit({
    workspaceId: input.workspaceId,
    actorFingerprint: dependencies.fingerprintActor(input.userId),
  });
  await dependencies.deleteWorkspace(input.workspaceId);
};
