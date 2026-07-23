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
      videoId: null,
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
});
