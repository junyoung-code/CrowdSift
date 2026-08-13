import {
  YOUTUBE_DAILY_QUOTA_UNITS,
  remainingModerationActions,
} from "./quota";

/**
 * 오늘 이 워크스페이스가 태운 YouTube 할당량.
 *
 * 읽기와 쓰기를 **합쳐서** 본다. 한도는 하나인데 둘로 나눠 보면, 가져오기를 잔뜩 한
 * 날 조치가 왜 막히는지 알 수 없다.
 *
 * 하루가 태평양 시각 자정에 바뀐다. 구글이 거기서 끊기 때문이고, 한국 시각으로 세면
 * 오후에 한도가 되살아나는 것처럼 보인다.
 */

export type QuotaUsage = {
  unitsUsedToday: number;
  dailyLimit: number;
  /** 남은 유닛으로 조치를 몇 번 더 할 수 있는지. */
  remainingActions: number;
};

export interface QuotaUsageRepository {
  sumUnitsSince(input: {
    workspaceId: string;
    since: string;
  }): Promise<number>;
}

/** 구글 할당량이 초기화되는 시각(태평양 자정)을 ISO 로 낸다. */
export const quotaDayStart = (now: Date): string => {
  // 태평양 시각으로 옮겨 날짜만 남기고, 그 자정을 다시 UTC 로 읽는다.
  const pacific = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
  );
  const offsetMs = now.getTime() - pacific.getTime();
  const midnightPacific = new Date(
    pacific.getFullYear(),
    pacific.getMonth(),
    pacific.getDate(),
  );

  return new Date(midnightPacific.getTime() + offsetMs).toISOString();
};

export const loadQuotaUsage = async (
  { now = new Date(), workspaceId }: { workspaceId: string; now?: Date },
  { repository }: { repository: QuotaUsageRepository },
): Promise<QuotaUsage> => {
  const unitsUsedToday = await repository.sumUnitsSince({
    workspaceId,
    since: quotaDayStart(now),
  });

  return {
    unitsUsedToday,
    dailyLimit: YOUTUBE_DAILY_QUOTA_UNITS,
    remainingActions: remainingModerationActions(unitsUsedToday),
  };
};
