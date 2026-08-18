import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FORCE_SSL_SCOPE,
  createModerationService,
  type ModerationRepository,
  type YouTubeModerationProvider,
} from "./moderation-service";

const target = {
  sourceKind: "owned_oauth" as const,
  sourceImportJobId: "import-job-1",
  youtubeCommentId: "youtube-comment-1",
  connectionId: "connection-1",
  connectionUpdatedAt: "2026-07-24T09:00:00.000Z",
  authorChannelId: "viewer-channel",
  selectedChannelId: "creator-channel",
  grantedScopes: [FORCE_SSL_SCOPE],
  sourceSnapshot: {
    youtubeCommentId: "youtube-comment-1",
    textDisplay: "보존할 원문",
  },
  analysisSnapshot: {
    reviewLevel: "risk",
    recommendedAction: "reject",
  },
};

const requestInput = {
  workspaceId: "workspace-1",
  rawCommentId: "raw-comment-1",
  sourceImportJobId: "import-job-1",
  action: "reject" as const,
  actorUserId: "user-1",
};

const confirmedInput = {
  workspaceId: "workspace-1",
  requestId: "request-1",
  actorUserId: "user-1",
  confirmation: "I_UNDERSTAND" as const,
};

const createDependencies = () => {
  let storedState:
    | "pending_confirmation"
    | "awaiting_scope"
    | "running"
    | "succeeded"
    | "failed" = "pending_confirmation";
  let storedResult = {
    requestId: "request-1",
    state: "succeeded" as const,
    providerStatus: 204,
    executedAt: "2026-07-23T00:00:00.000Z",
    errorCode: null,
  };

  const repository: ModerationRepository = {
    loadSourceObservation: vi.fn(async () => ({
      sourceKind: "owned_oauth" as const,
      sourceImportJobId: "import-job-1",
    })),
    loadTarget: vi.fn(async () => target),
    createRequestWithEvidence: vi.fn(async (input) => {
      storedState = input.state;
      return { requestId: "request-1", state: input.state };
    }),
    loadRequest: vi.fn(async () => ({
      requestId: "request-1",
      workspaceId: "workspace-1",
      rawCommentId: "raw-comment-1",
      sourceImportJobId: "import-job-1",
      sourceKind: "owned_oauth" as const,
      youtubeCommentId: "youtube-comment-1",
      requestedBy: "user-1",
      action: "reject" as const,
      state: storedState,
      grantedScopes: target.grantedScopes,
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: null,
      connectionId: "connection-1",
      connectionUpdatedAt: "2026-07-24T09:00:00.000Z",
      bindingValid: true,
      deleteEligible: true,
      result: storedState === "succeeded" ? storedResult : null,
    })),
    claimRequest: vi.fn(async () => {
      storedState = "running";
      return true;
    }),
    completeRequest: vi.fn(async (input) => {
      storedState = input.state;
      storedResult = {
        requestId: input.requestId,
        state: input.state,
        providerStatus: input.providerStatus,
        executedAt: input.executedAt,
        errorCode: input.errorCode,
      } as typeof storedResult;
      return storedResult;
    }),
    reconcileStaleRequest: vi.fn(async () => null),
  };
  const provider: YouTubeModerationProvider = {
    setModerationStatus: vi.fn(async () => ({
      status: 204,
      quotaUnitsUsed: 50,
    })),
    deleteComment: vi.fn(async () => ({ status: 204, quotaUnitsUsed: 50 })),
  };

  return { provider, repository };
};

describe("moderation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists the source evidence before calling YouTube", async () => {
    const dependencies = createDependencies();
    const service = createModerationService(dependencies);

    await service.requestModeration(requestInput);
    await service.confirmModeration(confirmedInput);

    expect(
      vi.mocked(dependencies.repository.createRequestWithEvidence).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(dependencies.provider.setModerationStatus).mock
        .invocationCallOrder[0],
    );
    expect(
      dependencies.repository.createRequestWithEvidence,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence: {
          source: target.sourceSnapshot,
          analysis: target.analysisSnapshot,
        },
      }),
    );
  });

  it("never calls YouTube without the exact confirmation", async () => {
    const dependencies = createDependencies();
    const service = createModerationService(dependencies);

    await expect(
      service.confirmModeration({
        ...confirmedInput,
        confirmation: "NO" as never,
      }),
    ).rejects.toThrow("Explicit confirmation required");
    expect(dependencies.provider.setModerationStatus).not.toHaveBeenCalled();
    expect(dependencies.provider.deleteComment).not.toHaveBeenCalled();
  });

  it("does not allow deleting a comment written by another channel", async () => {
    const dependencies = createDependencies();
    const service = createModerationService(dependencies);

    await expect(
      service.requestModeration({
        ...requestInput,
        action: "delete",
      }),
    ).rejects.toThrow(
      "Delete is available only for a comment authored by the connected channel",
    );
    expect(
      dependencies.repository.createRequestWithEvidence,
    ).not.toHaveBeenCalled();
  });

  it("rechecks delete ownership immediately before claiming the request", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.repository.loadRequest).mockResolvedValue({
      requestId: "request-1",
      workspaceId: "workspace-1",
      rawCommentId: "raw-comment-1",
      sourceImportJobId: "import-job-1",
      sourceKind: "owned_oauth",
      youtubeCommentId: "youtube-comment-1",
      requestedBy: "user-1",
      action: "delete",
      state: "pending_confirmation",
      grantedScopes: target.grantedScopes,
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: null,
      connectionId: "connection-1",
      connectionUpdatedAt: "2026-07-24T09:00:00.000Z",
      bindingValid: true,
      deleteEligible: false,
      result: null,
    });
    const service = createModerationService(dependencies);

    await expect(
      service.confirmModeration(confirmedInput),
    ).rejects.toThrow("Delete eligibility changed before confirmation");
    expect(dependencies.repository.claimRequest).not.toHaveBeenCalled();
    expect(dependencies.provider.deleteComment).not.toHaveBeenCalled();
  });

  it("rejects confirmation after the bound connection changes", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.repository.loadRequest).mockResolvedValue({
      requestId: "request-1",
      workspaceId: "workspace-1",
      rawCommentId: "raw-comment-1",
      sourceImportJobId: "import-job-1",
      sourceKind: "owned_oauth",
      youtubeCommentId: "youtube-comment-1",
      requestedBy: "user-1",
      action: "reject",
      state: "pending_confirmation",
      grantedScopes: target.grantedScopes,
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: null,
      connectionId: "connection-1",
      connectionUpdatedAt: "2026-07-24T09:00:00.000Z",
      bindingValid: false,
      deleteEligible: false,
      result: null,
    });
    const service = createModerationService(dependencies);

    await expect(
      service.confirmModeration(confirmedInput),
    ).rejects.toThrow("Moderation connection changed before confirmation");
    expect(dependencies.repository.claimRequest).not.toHaveBeenCalled();
    expect(dependencies.provider.setModerationStatus).not.toHaveBeenCalled();
  });

  it("records awaiting_scope instead of calling YouTube without force-ssl", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.repository.loadTarget).mockResolvedValue({
      ...target,
      grantedScopes: [],
    });
    const service = createModerationService(dependencies);

    await expect(service.requestModeration(requestInput)).resolves.toEqual({
      requestId: "request-1",
      state: "awaiting_scope",
    });
    expect(
      dependencies.repository.createRequestWithEvidence,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ state: "awaiting_scope" }),
    );
    expect(dependencies.provider.setModerationStatus).not.toHaveBeenCalled();
  });

  it("maps moderation actions and does not execute a succeeded request twice", async () => {
    const dependencies = createDependencies();
    const service = createModerationService(dependencies);

    await service.requestModeration(requestInput);
    await expect(
      service.confirmModeration(confirmedInput),
    ).resolves.toMatchObject({
      state: "succeeded",
      providerStatus: 204,
    });
    await expect(
      service.confirmModeration(confirmedInput),
    ).resolves.toMatchObject({
      state: "succeeded",
      providerStatus: 204,
    });

    expect(dependencies.provider.setModerationStatus).toHaveBeenCalledTimes(1);
    expect(dependencies.provider.setModerationStatus).toHaveBeenCalledWith({
      moderationStatus: "rejected",
      tokens: expect.objectContaining({ accessToken: "access-token" }),
      youtubeCommentId: "youtube-comment-1",
    });
  });

  it("retries durable completion without repeating the provider action", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.repository.completeRequest).mockRejectedValueOnce(
      new Error("database temporarily unavailable"),
    );
    const service = createModerationService(dependencies);

    await service.requestModeration(requestInput);
    await expect(
      service.confirmModeration(confirmedInput),
    ).resolves.toMatchObject({ state: "succeeded" });

    expect(dependencies.provider.setModerationStatus).toHaveBeenCalledTimes(1);
    expect(dependencies.repository.completeRequest).toHaveBeenCalledTimes(2);
  });

  it("marks a stale running request for manual reconciliation without retrying YouTube", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.repository.claimRequest).mockResolvedValue(false);
    vi.mocked(
      dependencies.repository.reconcileStaleRequest,
    ).mockResolvedValue({
      requestId: "request-1",
      state: "failed",
      providerStatus: null,
      executedAt: "2026-07-24T10:00:00.000Z",
      errorCode: "provider_result_unknown",
    });
    const service = createModerationService(dependencies);

    await expect(
      service.confirmModeration(confirmedInput),
    ).resolves.toMatchObject({
      state: "failed",
      errorCode: "provider_result_unknown",
    });

    expect(dependencies.provider.setModerationStatus).not.toHaveBeenCalled();
  });

  it("records a lost provider response as unknown and never retries the action", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.provider.setModerationStatus).mockRejectedValue(
      new Error("socket closed before response"),
    );
    const service = createModerationService(dependencies);

    await expect(
      service.confirmModeration(confirmedInput),
    ).resolves.toMatchObject({
      state: "failed",
      providerStatus: null,
      errorCode: "provider_result_unknown",
    });
    expect(dependencies.provider.setModerationStatus).toHaveBeenCalledTimes(1);
  });

  it("records a definite YouTube 403 response as a provider failure", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.provider.setModerationStatus).mockRejectedValue({
      response: { status: 403 },
    });
    const service = createModerationService(dependencies);

    await expect(
      service.confirmModeration(confirmedInput),
    ).resolves.toMatchObject({
      state: "failed",
      providerStatus: 403,
      errorCode: "youtube_moderation_failed",
    });
  });

  it("records an expired refresh grant as requiring YouTube reconnection", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.provider.setModerationStatus).mockRejectedValue({
      response: { status: 400, data: { error: "invalid_grant" } },
    });
    const service = createModerationService(dependencies);

    await expect(
      service.confirmModeration(confirmedInput),
    ).resolves.toMatchObject({
      state: "failed",
      providerStatus: 400,
      errorCode: "youtube_oauth_reconnect_required",
    });
    expect(dependencies.repository.completeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ quotaUnitsUsed: 0 }),
    );
  });

  it.each([
    "hold_for_review",
    "publish",
    "reject",
    "delete",
  ] as const)(
    "rejects %s for a public source before storing or calling YouTube",
    async (action) => {
      const dependencies = createDependencies();
      vi.mocked(
        dependencies.repository.loadSourceObservation,
      ).mockResolvedValue({
        sourceKind: "public_url",
        sourceImportJobId: "import-job-1",
      });
      const service = createModerationService(dependencies);

      await expect(
        service.requestModeration({ ...requestInput, action }),
      ).rejects.toMatchObject({ code: "PUBLIC_SOURCE_READ_ONLY" });
      expect(
        dependencies.repository.createRequestWithEvidence,
      ).not.toHaveBeenCalled();
      expect(dependencies.provider.setModerationStatus).not.toHaveBeenCalled();
      expect(dependencies.provider.deleteComment).not.toHaveBeenCalled();
    },
  );

  it("rejects a mismatched source observation before provider access", async () => {
    const dependencies = createDependencies();
    vi.mocked(
      dependencies.repository.loadSourceObservation,
    ).mockResolvedValue({
      sourceKind: "owned_oauth",
      sourceImportJobId: "different-import-job",
    });
    const service = createModerationService(dependencies);

    await expect(
      service.requestModeration(requestInput),
    ).rejects.toThrow("SOURCE_OBSERVATION_MISMATCH");
    expect(dependencies.provider.setModerationStatus).not.toHaveBeenCalled();
    expect(dependencies.provider.deleteComment).not.toHaveBeenCalled();
  });
});
