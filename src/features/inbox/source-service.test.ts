import { describe, expect, it, vi } from "vitest";

import {
  SourceAcknowledgementError,
  SourceNotFoundError,
  loadAcknowledgedSource,
  type SourceRepository,
} from "./source-service";

describe("acknowledged comment source", () => {
  it("rejects requests that do not explicitly acknowledge the warning", async () => {
    const repository: SourceRepository = {
      findOwnedSource: vi.fn(),
    };

    await expect(
      loadAcknowledgedSource(
        {
          acknowledged: false,
          commentId: "comment-1",
          workspaceId: "workspace-1",
        },
        repository,
      ),
    ).rejects.toBeInstanceOf(SourceAcknowledgementError);
    expect(repository.findOwnedSource).not.toHaveBeenCalled();
  });

  it("loads only the source scoped to the viewer workspace", async () => {
    const repository: SourceRepository = {
      findOwnedSource: vi.fn().mockResolvedValue({
        textDisplay: "표시 원문",
        textOriginal: "원본 HTML 이전 텍스트",
        capturedAt: "2026-07-23T00:00:00.000Z",
      }),
    };

    const result = await loadAcknowledgedSource(
      {
        acknowledged: true,
        commentId: "comment-1",
        workspaceId: "workspace-1",
      },
      repository,
    );

    expect(repository.findOwnedSource).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      commentId: "comment-1",
    });
    expect(result).toEqual({
      textDisplay: "표시 원문",
      textOriginal: "원본 HTML 이전 텍스트",
      capturedAt: "2026-07-23T00:00:00.000Z",
    });
  });

  it("does not reveal whether a comment exists outside the workspace", async () => {
    const repository: SourceRepository = {
      findOwnedSource: vi.fn().mockResolvedValue(null),
    };

    await expect(
      loadAcknowledgedSource(
        {
          acknowledged: true,
          commentId: "comment-other",
          workspaceId: "workspace-1",
        },
        repository,
      ),
    ).rejects.toBeInstanceOf(SourceNotFoundError);
  });
});
