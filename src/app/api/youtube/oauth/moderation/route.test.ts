import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateYouTubeProvider,
  mockGetAuthorizationUrl,
  mockIssueOAuthState,
  mockMaybeSingle,
  mockRequireViewer,
} = vi.hoisted(() => ({
  mockCreateYouTubeProvider: vi.fn(),
  mockGetAuthorizationUrl: vi.fn(),
  mockIssueOAuthState: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockRequireViewer: vi.fn(),
}));

vi.mock("@/features/auth/require-viewer", () => ({
  requireViewer: mockRequireViewer,
}));

vi.mock("@/features/youtube/oauth-state-cookie", () => ({
  issueOAuthState: mockIssueOAuthState,
}));

vi.mock("@/features/youtube/provider-factory", () => ({
  createYouTubeProvider: mockCreateYouTubeProvider,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: mockMaybeSingle,
    };
    return { from: vi.fn(() => query) };
  }),
}));

import { FORCE_SSL_SCOPE } from "@/features/moderation/moderation-service";

import { GET } from "./route";

describe("GET /api/youtube/oauth/moderation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireViewer.mockResolvedValue({
      userId: "33333333-3333-4333-8333-333333333333",
      workspaceId: "44444444-4444-4444-8444-444444444444",
    });
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "55555555-5555-4555-8555-555555555555",
        state: "awaiting_scope",
      },
      error: null,
    });
    mockIssueOAuthState.mockResolvedValue("oauth-state");
    mockGetAuthorizationUrl.mockReturnValue(
      "https://accounts.google.com/o/oauth2/auth?state=oauth-state",
    );
    mockCreateYouTubeProvider.mockReturnValue({
      getAuthorizationUrl: mockGetAuthorizationUrl,
    });
  });

  it("requests only the incremental moderation scope for an owned request", async () => {
    const response = await GET(
      new Request(
        "http://localhost:3000/api/youtube/oauth/moderation?requestId=55555555-5555-4555-8555-555555555555",
      ),
    );

    expect(response.status).toBe(307);
    expect(mockIssueOAuthState).toHaveBeenCalledWith({
      purpose: "moderation",
      actionRequestId: "55555555-5555-4555-8555-555555555555",
    });
    expect(mockGetAuthorizationUrl).toHaveBeenCalledWith({
      state: "oauth-state",
      scopes: [FORCE_SSL_SCOPE],
      includeGrantedScopes: true,
      accessType: "offline",
      prompt: "consent",
    });
  });

  it("rejects a request that is not awaiting a scope grant", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await GET(
      new Request(
        "http://localhost:3000/api/youtube/oauth/moderation?requestId=55555555-5555-4555-8555-555555555555",
      ),
    );

    expect(response.status).toBe(404);
    expect(mockIssueOAuthState).not.toHaveBeenCalled();
  });
});
