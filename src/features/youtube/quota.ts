/**
 * YouTube Data API v3 가 호출마다 가져가는 할당량.
 *
 * 하루 기본 한도가 10,000 유닛이다. 읽기와 쓰기의 값이 **오십 배 차이**라, 둘을 같은
 * 눈으로 보면 설계를 그르친다.
 *
 *   댓글 50개 가져오기   2~3 유닛    (한 페이지에 1)
 *   악플 하나 숨기기      50 유닛
 *
 * 숨기기 한 번이 가져오기 스무 번 값이다. 하루에 조치할 수 있는 것이 **200건**이고,
 * 그것도 다른 호출을 하나도 하지 않을 때다. 「걸린 것 전부 숨기기」 같은 버튼을 만들면
 * 악플 많은 채널에서 첫날에 한도가 끊긴다.
 *
 * 값은 구글 문서의 고정값이고 응답에 실려 오지 않는다. 그래서 우리가 적어 두고 센다.
 */
export const YOUTUBE_QUOTA_UNITS = {
  /** commentThreads.list · comments.list — 페이지 하나에 1 */
  read: 1,
  /** comments.setModerationStatus — 보류·승인·거절 모두 같은 값 */
  setModerationStatus: 50,
  /** comments.delete */
  deleteComment: 50,
} as const;

/** 하루 기본 한도. 구글 콘솔에서 늘릴 수 있지만 심사를 거쳐야 한다. */
export const YOUTUBE_DAILY_QUOTA_UNITS = 10_000;

/** 남은 유닛으로 조치를 몇 번 더 할 수 있는지. 화면이 이 숫자로 말한다. */
export const remainingModerationActions = (unitsUsedToday: number) =>
  Math.max(
    0,
    Math.floor(
      (YOUTUBE_DAILY_QUOTA_UNITS - unitsUsedToday) /
        YOUTUBE_QUOTA_UNITS.setModerationStatus,
    ),
  );
