import { describe, expect, it, vi } from "vitest";

import {
  deleteWorkspaceData,
  type WorkspaceDeletionDependencies,
} from "./workspace-deletion-service";

const createDependencies = () => {
  const callOrder: string[] = [];
  const dependencies: WorkspaceDeletionDependencies = {
    verifyOwner: vi.fn(async () => {
      callOrder.push("verify-owner");
      return true;
    }),
    revokeGoogleToken: vi.fn(async () => {
      callOrder.push("revoke-token");
    }),
    clearEncryptedTokens: vi.fn(async () => {
      callOrder.push("clear-tokens");
    }),
    insertContentFreeDeletionAudit: vi.fn(async () => {
      callOrder.push("insert-audit");
    }),
    deleteWorkspace: vi.fn(async () => {
      callOrder.push("delete-workspace");
    }),
    fingerprintActor: vi.fn(() => "actor-fingerprint"),
  };

  return { callOrder, dependencies };
};

describe("deleteWorkspaceData", () => {
  it("deletes tenant data only after the exact confirmation", async () => {
    const { callOrder, dependencies } = createDependencies();

    await expect(
      deleteWorkspaceData(
        {
          userId: "u1",
          workspaceId: "w1",
          confirmation: "삭제",
        },
        dependencies,
      ),
    ).rejects.toThrow("Exact deletion confirmation required");

    expect(callOrder).toEqual([]);

    await deleteWorkspaceData(
      {
        userId: "u1",
        workspaceId: "w1",
        confirmation: "CROWDSIFT 데이터 삭제",
      },
      dependencies,
    );

    expect(dependencies.deleteWorkspace).toHaveBeenCalledWith("w1");
    expect(callOrder).toEqual([
      "verify-owner",
      "revoke-token",
      "clear-tokens",
      "insert-audit",
      "delete-workspace",
    ]);
  });

  it("refuses deletion when the viewer is not the workspace owner", async () => {
    const { dependencies } = createDependencies();
    vi.mocked(dependencies.verifyOwner).mockResolvedValue(false);

    await expect(
      deleteWorkspaceData(
        {
          userId: "u2",
          workspaceId: "w1",
          confirmation: "CROWDSIFT 데이터 삭제",
        },
        dependencies,
      ),
    ).rejects.toThrow("Workspace owner required");

    expect(dependencies.clearEncryptedTokens).not.toHaveBeenCalled();
    expect(dependencies.deleteWorkspace).not.toHaveBeenCalled();
  });
});
