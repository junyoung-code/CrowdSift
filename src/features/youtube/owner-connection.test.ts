import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { markOwnerConnectionRevoked } from "./owner-connection";

const adminWithResult = (data: { id: string } | null) => {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["update", "eq", "select"]) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    });
  }
  builder.maybeSingle = vi.fn(async () => ({ data, error: null }));
  return {
    admin: { from: vi.fn(() => builder) },
    calls,
  };
};

describe("owner connection revocation", () => {
  it("clears tokens only while the same connected version is still current", async () => {
    const { admin, calls } = adminWithResult({ id: "connection-1" });

    await expect(
      markOwnerConnectionRevoked({
        admin: admin as never,
        connectionId: "connection-1",
        connectionUpdatedAt: "2026-08-17T00:00:00.000Z",
        workspaceId: "workspace-1",
      }),
    ).resolves.toBe(true);

    expect(calls[0]).toEqual([
      "update",
      expect.objectContaining({
        encrypted_access_token: null,
        encrypted_refresh_token: null,
        status: "revoked",
      }),
    ]);
    expect(calls).toContainEqual(["eq", "id", "connection-1"]);
    expect(calls).toContainEqual(["eq", "workspace_id", "workspace-1"]);
    expect(calls).toContainEqual(["eq", "status", "connected"]);
    expect(calls).toContainEqual([
      "eq",
      "updated_at",
      "2026-08-17T00:00:00.000Z",
    ]);
  });

  it("does not revoke a newly reconnected version", async () => {
    const { admin } = adminWithResult(null);

    await expect(
      markOwnerConnectionRevoked({
        admin: admin as never,
        connectionId: "connection-1",
        connectionUpdatedAt: "stale-version",
        workspaceId: "workspace-1",
      }),
    ).resolves.toBe(false);
  });
});
