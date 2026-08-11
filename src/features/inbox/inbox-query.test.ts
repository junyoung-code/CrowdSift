import { describe, expect, it, vi } from "vitest";

import { getInboxPage, type InboxRepository } from "./inbox-query";

describe("Comment Inbox query", () => {
  it("defaults to caution and risk", async () => {
    const repository: InboxRepository = {
      query: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    const result = await getInboxPage(
      {
        workspaceId: "workspace-1",
        searchParams: {},
      },
      repository,
    );

    expect(repository.query).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        reviewLevels: ["caution", "risk"],
      }),
    );
    expect(result.filters.reviewLevels).toEqual(["caution", "risk"]);
  });

  it("accepts only known URL filter values", async () => {
    const repository: InboxRepository = {
      query: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    await getInboxPage(
      {
        workspaceId: "workspace-1",
        searchParams: {
          levels: ["safe", "not-a-level"],
          category: "question",
          analysis: "failed",
          action: "succeeded",
          minConfidence: "-1",
          maxConfidence: "0.72",
          page: "2",
          search: "  자막  ",
        },
      },
      repository,
    );

    expect(repository.query).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      reviewLevels: ["safe"],
      category: "question",
      videoIds: [],
      analysisState: "failed",
      actionState: "succeeded",
      minConfidence: 0,
      maxConfidence: 0.72,
      search: "자막",
      limit: 25,
      offset: 25,
    });
  });

  it("does not turn empty confidence fields into zero filters", async () => {
    const repository: InboxRepository = {
      query: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    await getInboxPage(
      {
        workspaceId: "workspace-1",
        searchParams: {
          minConfidence: "",
          maxConfidence: "",
        },
      },
      repository,
    );

    expect(repository.query).toHaveBeenCalledWith(
      expect.objectContaining({
        minConfidence: null,
        maxConfidence: null,
      }),
    );
  });

  it("takes several videos at once", async () => {
    const repository: InboxRepository = {
      query: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    await getInboxPage(
      {
        workspaceId: "workspace-1",
        searchParams: { video: ["video-1", "video-2", "video-1"] },
      },
      repository,
    );

    expect(repository.query).toHaveBeenCalledWith(
      expect.objectContaining({ videoIds: ["video-1", "video-2"] }),
    );
  });

  it("reads a hand-written comma list from the address bar", async () => {
    const repository: InboxRepository = {
      query: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    await getInboxPage(
      {
        workspaceId: "workspace-1",
        searchParams: { video: "video-1, video-2 ,,  " },
      },
      repository,
    );

    expect(repository.query).toHaveBeenCalledWith(
      expect.objectContaining({ videoIds: ["video-1", "video-2"] }),
    );
  });

  it("caps how many videos one address can ask for", async () => {
    // 주소를 손으로 늘려 질의를 무겁게 만들 수 있다.
    const repository: InboxRepository = {
      query: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    await getInboxPage(
      {
        workspaceId: "workspace-1",
        searchParams: {
          video: Array.from({ length: 80 }, (_, index) => `video-${index}`),
        },
      },
      repository,
    );

    const [[call]] = (repository.query as ReturnType<typeof vi.fn>).mock.calls;
    expect(call.videoIds).toHaveLength(50);
  });
});
