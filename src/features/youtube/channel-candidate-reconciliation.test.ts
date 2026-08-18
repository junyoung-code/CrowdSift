import { describe, expect, it } from "vitest";

import { planChannelCandidateReconciliation } from "./channel-candidate-reconciliation";

const channel = (
  id: string,
  title = id,
) => ({
  id,
  title,
  handle: null,
  thumbnailUrl: null,
});

describe("planChannelCandidateReconciliation", () => {
  it("preserves the configured channel and removes only stale candidates", () => {
    const plan = planChannelCandidateReconciliation({
      channels: [channel("current-channel", "Current channel")],
      configuredChannelId: "current-channel",
      existingCandidates: [
        { youtube_channel_id: "current-channel", selected: true },
        { youtube_channel_id: "stale-channel", selected: false },
      ],
    });

    expect(plan.status).toBe("connected");
    expect(plan.staleChannelIds).toEqual(["stale-channel"]);
    expect(plan.candidates).toEqual([
      expect.objectContaining({
        youtube_channel_id: "current-channel",
        selected: true,
      }),
    ]);
  });

  it("keeps history bound to its channel when another Google account is used", () => {
    expect(() =>
      planChannelCandidateReconciliation({
        channels: [channel("different-channel")],
        configuredChannelId: "current-channel",
        existingCandidates: [
          { youtube_channel_id: "current-channel", selected: true },
        ],
      }),
    ).toThrow("configured_youtube_channel_not_owned");
  });

  it("selects the only channel on a first connection", () => {
    const plan = planChannelCandidateReconciliation({
      channels: [channel("only-channel")],
      configuredChannelId: null,
      existingCandidates: [],
    });

    expect(plan.status).toBe("connected");
    expect(plan.candidates[0]?.selected).toBe(true);
  });
});
