import { describe, expect, it, vi } from "vitest";

import { completeModerationOAuth } from "./moderation-oauth";

describe("completeModerationOAuth", () => {
  it("stores the expanded grant and returns to confirmation without executing", async () => {
    const provider = {
      exchangeCode: vi.fn(async () => ({
        accessToken: "new-access",
        refreshToken: null,
        expiresAt: "2026-07-24T10:00:00.000Z",
        grantedScopes: [
          "https://www.googleapis.com/auth/youtube.readonly",
          "https://www.googleapis.com/auth/youtube.force-ssl",
        ],
        googleSubject: null,
      })),
      listOwnedChannels: vi.fn(async () => [
        {
          id: "creator-channel",
          title: "Creator",
          handle: null,
          thumbnailUrl: null,
        },
      ]),
    };
    const repository = {
      loadAwaitingRequest: vi.fn(async () => ({
        connectionId: "connection-1",
        connectionUpdatedAt: "2026-07-24T09:00:00.000Z",
        selectedChannelId: "creator-channel",
      })),
      completeGrant: vi.fn(async () => true),
    };

    await expect(
      completeModerationOAuth(
        {
          workspaceId: "workspace-1",
          actorUserId: "user-1",
          requestId: "request-1",
          code: "oauth-code",
        },
        { provider, repository },
      ),
    ).resolves.toEqual({ requestId: "request-1" });

    expect(repository.completeGrant).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorUserId: "user-1",
      requestId: "request-1",
      tokens: expect.objectContaining({
        accessToken: "new-access",
        refreshToken: null,
      }),
      expectedBinding: {
        connectionId: "connection-1",
        connectionUpdatedAt: "2026-07-24T09:00:00.000Z",
        selectedChannelId: "creator-channel",
      },
    });
    expect(provider).not.toHaveProperty("setModerationStatus");
    expect(provider).not.toHaveProperty("deleteComment");
  });

  it("rejects an action request that is not owned and awaiting scope", async () => {
    const provider = {
      exchangeCode: vi.fn(),
      listOwnedChannels: vi.fn(),
    };
    const repository = {
      loadAwaitingRequest: vi.fn(async () => null),
      completeGrant: vi.fn(),
    };

    await expect(
      completeModerationOAuth(
        {
          workspaceId: "workspace-1",
          actorUserId: "user-1",
          requestId: "request-1",
          code: "oauth-code",
        },
        { provider, repository },
      ),
    ).rejects.toThrow("Moderation request is not awaiting scope");

    expect(provider.exchangeCode).not.toHaveBeenCalled();
    expect(repository.completeGrant).not.toHaveBeenCalled();
  });

  it("rejects a new grant that does not own the bound creator channel", async () => {
    const provider = {
      exchangeCode: vi.fn(async () => ({
        accessToken: "other-access",
        refreshToken: "other-refresh",
        expiresAt: null,
        grantedScopes: [
          "https://www.googleapis.com/auth/youtube.force-ssl",
        ],
        googleSubject: null,
      })),
      listOwnedChannels: vi.fn(async () => [
        {
          id: "another-channel",
          title: "Another",
          handle: null,
          thumbnailUrl: null,
        },
      ]),
    };
    const repository = {
      loadAwaitingRequest: vi.fn(async () => ({
        connectionId: "connection-1",
        connectionUpdatedAt: "2026-07-24T09:00:00.000Z",
        selectedChannelId: "creator-channel",
      })),
      completeGrant: vi.fn(),
    };

    await expect(
      completeModerationOAuth(
        {
          workspaceId: "workspace-1",
          actorUserId: "user-1",
          requestId: "request-1",
          code: "oauth-code",
        },
        { provider, repository },
      ),
    ).rejects.toThrow("Google grant does not own the selected channel");

    expect(repository.completeGrant).not.toHaveBeenCalled();
  });

  it("does not resume confirmation when Google omits the moderation scope", async () => {
    const provider = {
      exchangeCode: vi.fn(async () => ({
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: null,
        grantedScopes: [
          "https://www.googleapis.com/auth/youtube.readonly",
        ],
        googleSubject: null,
      })),
      listOwnedChannels: vi.fn(),
    };
    const repository = {
      loadAwaitingRequest: vi.fn(async () => ({
        connectionId: "connection-1",
        connectionUpdatedAt: "2026-07-24T09:00:00.000Z",
        selectedChannelId: "creator-channel",
      })),
      completeGrant: vi.fn(),
    };

    await expect(
      completeModerationOAuth(
        {
          workspaceId: "workspace-1",
          actorUserId: "user-1",
          requestId: "request-1",
          code: "oauth-code",
        },
        { provider, repository },
      ),
    ).rejects.toThrow("Google grant is missing the moderation scope");

    expect(provider.listOwnedChannels).not.toHaveBeenCalled();
    expect(repository.completeGrant).not.toHaveBeenCalled();
  });
});
