/**
 * 재생 위치만 적어 둔 댓글인지 가른다.
 *
 * 「3:15」「0:00 인트로 / 2:10 베란다」 같은 것은 크리에이터가 읽고 판단할 거리가
 * 없는데도 모델 호출 비용은 똑같이 든다. 수집 단계에서 걸러 낸다.
 *
 * 거르는 쪽보다 **남기는 쪽으로 기운다.** 「3:15 이 부분 자막 오타 났어요」는 위치로
 * 시작할 뿐 엄연한 요청이다. 이런 것을 하나 잃는 손해가, 타임스탬프 하나를 더 분석하는
 * 비용보다 크다.
 */

/** `3:15` `12:30` `1:02:33` 같은 재생 위치. */
const TIMESTAMP = /^\d{1,2}:\d{2}(?::\d{2})?$/u;

/** 목차를 나눠 적을 때 쓰는 기호. */
const SEPARATOR = /^[-–—~/|,.·:>()[\]]+$/u;

/**
 * 위치가 하나뿐일 때 꼬리표로 볼 수 있는 글자 수.
 *
 * 아주 짧게 잡는다. 실제 수집 데이터에 「3:15  잘생기면 쌉가능」이 있었는데, 넉넉히
 * 잡았더니 이것이 목차로 걸러졌다. 판단할 거리가 있는 진짜 댓글이다.
 */
const SINGLE_LABEL_MAX_CHARS = 4;

/** 위치가 여럿이면 목차일 가능성이 높으므로 꼬리표를 조금 길게 허용한다. */
const CHAPTER_LABEL_MAX_CHARS = 6;

export const isTimestampOnlyComment = (text: string): boolean => {
  const trimmed = text.replace(/​/gu, "").trim();
  if (trimmed.length === 0) return false;

  const tokens = trimmed.split(/\s+/u).filter((token) => token.length > 0);
  const labels: string[] = [];
  let timestamps = 0;

  for (const token of tokens) {
    if (TIMESTAMP.test(token)) {
      timestamps += 1;
      continue;
    }
    if (SEPARATOR.test(token)) continue;

    // 위치를 하나도 못 봤는데 다른 말이 먼저 나오면 그냥 댓글이다.
    if (timestamps === 0) return false;
    labels.push(token);
  }

  if (timestamps === 0) return false;

  // 위치가 여럿이면 목차다. 꼬리표가 낱말마다 짧기만 하면 된다.
  if (timestamps >= 2) {
    return labels.every((label) => label.length <= CHAPTER_LABEL_MAX_CHARS);
  }

  // 위치가 하나면 뒤에 붙은 말이 본문일 수 있다. 아주 짧을 때만 꼬리표로 본다.
  const labelChars = labels.reduce((total, label) => total + label.length, 0);
  return labelChars <= SINGLE_LABEL_MAX_CHARS;
};
