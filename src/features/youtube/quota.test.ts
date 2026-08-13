import { describe, expect, it, vi } from "vitest";

import {
  YOUTUBE_DAILY_QUOTA_UNITS,
  YOUTUBE_QUOTA_UNITS,
  remainingModerationActions,
} from "./quota";
import { loadQuotaUsage, quotaDayStart } from "./quota-usage";

describe("youtube quota", () => {
  it("prices a write fifty times a read", () => {
    // 이 비율이 설계를 정한다. 「걸린 것 전부 숨기기」가 왜 위험한지가 여기서 나온다.
    expect(YOUTUBE_QUOTA_UNITS.setModerationStatus).toBe(
      YOUTUBE_QUOTA_UNITS.read * 50,
    );
  });

  it("gives two hundred actions on an untouched day", () => {
    expect(remainingModerationActions(0)).toBe(200);
  });

  it("counts down as the day is spent", () => {
    expect(remainingModerationActions(YOUTUBE_DAILY_QUOTA_UNITS / 2)).toBe(100);
  });

  it("never promises an action once the day is gone", () => {
    expect(remainingModerationActions(YOUTUBE_DAILY_QUOTA_UNITS)).toBe(0);
    expect(remainingModerationActions(YOUTUBE_DAILY_QUOTA_UNITS + 500)).toBe(0);
  });

  it("counts reading against the same budget as writing", async () => {
    // 한도는 하나다. 가져오기를 잔뜩 한 날 조치가 막히는 이유가 이것이다.
    const usage = await loadQuotaUsage(
      { workspaceId: "workspace-1" },
      { repository: { sumUnitsSince: vi.fn(async () => 9_950) } },
    );

    expect(usage.remainingActions).toBe(1);
  });

  it("starts the day where Google starts it, not where we are", () => {
    // 한국 시각으로 세면 오후에 한도가 되살아나는 것처럼 보인다.
    const seoulAfternoon = new Date("2026-08-13T05:00:00Z"); // 서울 14:00, 태평양 전날 22:00
    const dayStart = new Date(quotaDayStart(seoulAfternoon));

    expect(dayStart.getTime()).toBeLessThan(seoulAfternoon.getTime());
    // 태평양 기준으로는 아직 8/12 이므로 그날 자정부터 센다.
    expect(seoulAfternoon.getTime() - dayStart.getTime()).toBeLessThan(
      36 * 60 * 60 * 1000,
    );
  });
});
