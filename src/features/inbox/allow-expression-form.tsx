"use client";

import { suggestAllowedExpressions } from "@/features/classification/suggest-allowed-expression";

/**
 * 이 채널에서는 칭찬으로 쓰이는 말이 주의로 잡혔을 때 한 번에 풀어 준다.
 *
 * 「AI 판단 수정」은 이 댓글 하나를 고치는 일이고, 이것은 앞으로 올 댓글에 쓸 말을
 * 채널에 등록하는 일이다. 그래서 같은 상자에 넣지 않았다.
 *
 * 원문을 펼친 자리에만 둔다. 주의 댓글의 원문은 목록 데이터에 실려 오지 않고,
 * 무엇을 풀어 주는지 읽지도 않은 채 등록하게 두어서도 안 된다.
 */
export function AllowExpressionForm({
  action,
  sourceText,
}: {
  action: (formData: FormData) => void | Promise<void>;
  sourceText: string;
}) {
  const [suggestion] = suggestAllowedExpressions(sourceText);
  // 아무 낱말이나 칭찬이라고 밀어 넣느니 묻지 않는 편이 낫다.
  if (!suggestion) return null;

  return (
    <form action={action} className="inbox-allow-expression">
      <p>
        <strong>이건 우리 채널에선 칭찬인가요?</strong>
        <small>
          등록하면 앞으로 이 표현 때문에 주의로 잡히지 않습니다. 이미 내려진 판단은
          그대로 둡니다.
        </small>
      </p>
      <label>
        <span>허용할 표현</span>
        <input
          defaultValue={suggestion}
          maxLength={40}
          name="expression"
          required
          type="text"
        />
      </label>
      <button className="button button-primary" type="submit">
        칭찬으로 등록
      </button>
    </form>
  );
}
