import { describe, expect, it } from "vitest";

import { canAllowChannelExpression } from "./allow-expression-eligibility";
import type { InboxItem } from "./inbox-query";

const caution = {
  sourceKind: "owned_oauth",
  reviewLevel: "caution",
  sourceAvailable: true,
} as InboxItem;

describe("canAllowChannelExpression", () => {
  it("asks on a caution comment from the creator's own channel", () => {
    expect(canAllowChannelExpression(caution)).toBe(true);
  });

  it("stays silent on a comment from someone else's video", () => {
    // 남의 영상에 달린 말로 내 채널의 말투를 정할 수는 없다.
    expect(
      canAllowChannelExpression({ ...caution, sourceKind: "public_url" }),
    ).toBe(false);
  });

  it("stays silent on a risk comment", () => {
    // 위험을 한 번에 푸는 버튼은 두지 않는다.
    expect(
      canAllowChannelExpression({ ...caution, reviewLevel: "risk" }),
    ).toBe(false);
  });

  it("stays silent on a safe comment", () => {
    expect(
      canAllowChannelExpression({ ...caution, reviewLevel: "safe" }),
    ).toBe(false);
  });

  it("stays silent while the comment is still waiting for review", () => {
    expect(canAllowChannelExpression({ ...caution, reviewLevel: null })).toBe(
      false,
    );
  });

  it("stays silent once the source is gone from YouTube", () => {
    expect(
      canAllowChannelExpression({ ...caution, sourceAvailable: false }),
    ).toBe(false);
  });
});
