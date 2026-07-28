import { describe, expect, it, vi } from "vitest";

import {
  selectChannel,
  type ChannelSelectionRepository,
} from "./channel-service";

const createRepository = (): ChannelSelectionRepository => ({
  selectOnly: vi.fn(async () => undefined),
});

describe("selectChannel", () => {
  it("selects exactly one candidate and clears an older selection", async () => {
    const repository = createRepository();

    await selectChannel({
      workspaceId: "w1",
      channelId: "channel-b",
      repository,
    });

    expect(repository.selectOnly).toHaveBeenCalledWith("w1", "channel-b");
  });

  it("rejects an empty channel selection", async () => {
    const repository = createRepository();

    await expect(
      selectChannel({
        workspaceId: "w1",
        channelId: "",
        repository,
      }),
    ).rejects.toThrow("Exactly one channel is required");
    expect(repository.selectOnly).not.toHaveBeenCalled();
  });
});
