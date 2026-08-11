import type { Rewrite } from "./schemas";

/**
 * 순화문을 크리에이터에게 보내기 전 코드가 하는 검사.
 *
 * 모델에게 "하지 마" 라고 쓰는 것만으로는 믿지 않는다. 크리에이터는 원문을 보지 않기로
 * 했으므로, 여기를 통과한 문장이 그 댓글에 대해 보게 될 전부다. 잘못된 문장을 보내는
 * 것보다 아무것도 보내지 않는 편이 낫다.
 */

export type RewriteRejection =
  /** 모델 스스로 원문에 없는 것을 보탰다고 답했다. */
  | "model_reported_addition"
  /** 문장이 비어 있다. */
  | "empty"
  /** 원문의 표현을 그대로 옮겨 적었다. */
  | "copied_from_source"
  /** 한 문장에 꾸밈 표시가 둘 이상이다. */
  | "too_many_marks"
  /** 쓰기로 한 목록에 없는 표시를 썼다. */
  | "disallowed_mark";

export type RewriteInspection = {
  accepted: boolean;
  rejections: RewriteRejection[];
};

/** 기획서가 허용한 문장부호·이모티콘. 마침표 하나는 꾸밈으로 세지 않는다. */
const ALLOWED_MARKS = ["..", "!", ":)", "^^", "ㅎㅎ"] as const;

/** 기획서가 이름을 들어 금지한 표현. */
const DISALLOWED_MARKS = [/ㅋㅋㅋ/, /ㅠㅠ/, /ㅜㅜ/, /\p{Extended_Pictographic}/u];

/**
 * 원문에서 이만큼 이어지는 토막이 순화문에 그대로 있으면 베낀 것으로 본다.
 *
 * 욕설 목록을 두지 않는 대신 "그대로 옮겼는가" 로 검사한다. 낱말 목록은 기획에 없고,
 * 새 표현이 나올 때마다 뒤쫓아야 하는 데다, 정작 문제는 특정 낱말이 아니라 원문의
 * 가시가 그대로 넘어오는 것이기 때문이다.
 *
 * 8자면 "편집", "썸네일" 같은 정상적인 겹침은 지나가고 문장 토막만 걸린다.
 *
 * **말을 바꿔 옮긴 것은 잡지 못한다.** "편집이 개 느리네요" 는 가시를 그대로 두고도
 * 여덟 자 연속을 피한다. 그쪽은 프롬프트가 맡고, 여기는 통째로 베낀 경우를 막는
 * 마지막 그물이다.
 */
const COPIED_RUN_LENGTH = 8;

const sentencesOf = (text: string) =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const markCount = (sentence: string) => {
  let remaining = sentence;
  let count = 0;

  // 긴 것부터 세어야 ".." 가 "." 두 개로 흩어지지 않는다.
  for (const mark of ALLOWED_MARKS) {
    while (remaining.includes(mark)) {
      remaining = remaining.replace(mark, "");
      count += 1;
    }
  }

  return count;
};

/**
 * 공백을 걷어낸 원문에서 순화문에 그대로 나타나는 토막이 있는지.
 * 띄어쓰기만 바꿔 옮긴 경우를 놓치지 않으려고 양쪽 다 붙여서 본다.
 */
const copiedFromSource = (rewritten: string, sourceText: string) => {
  const source = sourceText.replace(/\s+/g, "");
  const target = rewritten.replace(/\s+/g, "");

  for (let start = 0; start + COPIED_RUN_LENGTH <= source.length; start += 1) {
    if (target.includes(source.slice(start, start + COPIED_RUN_LENGTH))) {
      return true;
    }
  }

  return false;
};

export const inspectRewrite = ({
  rewrite,
  sourceText,
}: {
  rewrite: Rewrite;
  sourceText: string;
}): RewriteInspection => {
  const rejections: RewriteRejection[] = [];
  const rewritten = rewrite.rewritten.trim();

  if (rewritten.length === 0) {
    rejections.push("empty");
  }

  if (!rewrite.addedNothing) {
    rejections.push("model_reported_addition");
  }

  if (rewritten.length > 0 && copiedFromSource(rewritten, sourceText)) {
    rejections.push("copied_from_source");
  }

  if (DISALLOWED_MARKS.some((pattern) => pattern.test(rewritten))) {
    rejections.push("disallowed_mark");
  }

  if (sentencesOf(rewritten).some((sentence) => markCount(sentence) > 1)) {
    rejections.push("too_many_marks");
  }

  return { accepted: rejections.length === 0, rejections };
};
