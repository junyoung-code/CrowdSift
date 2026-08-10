/**
 * 크리에이터가 "이건 칭찬이에요" 를 눌렀을 때, 허용 목록에 넣을 표현을 제안한다.
 *
 * 여기서 나온 값으로 등급을 정하지 않는다. 사람이 보고 고칠 수 있는 입력칸의
 * 기본값일 뿐이다. 그래서 놓치는 것은 괜찮지만, 엉뚱한 말을 칭찬이라고
 * 밀어 넣어서는 안 된다.
 *
 * Luna 는 "비속어가 있다" 까지만 말하고 어느 낱말인지는 알려 주지 않는다.
 * 그 빈자리를 사람이 채우게 하되, 매번 처음부터 타이핑하게 두지 않는 것이 목적이다.
 */

/**
 * 칭찬을 키울 때 쓰이는 강조 표현만 둔다.
 *
 * 공격에 쓰이는 욕은 넣지 않는다. 크리에이터가 실수로 확인 버튼을 눌러도
 * 인신공격에 쓰이는 말이 통째로 풀리는 일은 없어야 한다.
 */
const PRAISE_INTENSIFIERS = [
  "개",
  "ㅈㄴ",
  "존나",
  "쫀나",
  "쫗나",
  "졸라",
  "ㅁㅊ",
  "미쳤",
  "ㄹㅇ",
  "오지",
  "지린",
  "쌉",
] as const;

/** 낱말 하나가 아니라 붙어 다니는 덩어리로 잡아야 쓸모가 있다. */
const CHUNK_AFTER = 6;

export const suggestAllowedExpressions = (sourceText: string): string[] => {
  const text = sourceText.trim();
  if (text.length === 0) return [];

  const found: string[] = [];

  for (const intensifier of PRAISE_INTENSIFIERS) {
    const index = text.indexOf(intensifier);
    if (index === -1) continue;

    // "개웃김" 처럼 뒤에 붙은 말까지 함께 제안한다. "개" 하나만 풀어 주면
    // 이 채널에서 "개" 로 시작하는 모든 말이 함께 풀린다.
    const chunk = text
      .slice(index, index + intensifier.length + CHUNK_AFTER)
      .split(/[\s.,!?~…"'()[\]]/)[0]
      .replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9]/gu, "");

    const suggestion = chunk.length >= intensifier.length ? chunk : intensifier;
    if (!found.includes(suggestion)) found.push(suggestion);
  }

  return found.slice(0, 3);
};
