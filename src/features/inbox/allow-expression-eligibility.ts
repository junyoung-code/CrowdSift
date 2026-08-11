import type { InboxItem } from "./inbox-query";

/**
 * 「이건 우리 채널에선 칭찬인가요?」 를 물어봐도 되는 댓글인지 가른다.
 *
 * 여기서 참이어도 표현이 잡히지 않으면 폼은 나오지 않는다. 그 판단은 원문을
 * 펼친 뒤에야 할 수 있어서 클라이언트 쪽에 있다.
 */
export const canAllowChannelExpression = (item: InboxItem): boolean => {
  // 남의 영상에 달린 말로 내 채널의 말투를 정할 수는 없다.
  if (item.sourceKind === "public_url") return false;
  // 위험을 한 번에 푸는 버튼은 두지 않는다.
  if (item.reviewLevel !== "caution") return false;
  // 원문이 사라졌으면 무엇을 풀어 주는지 보여 줄 수 없다.
  return item.sourceAvailable;
};
