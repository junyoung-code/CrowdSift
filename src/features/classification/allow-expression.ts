import { ClassificationProfileSchema } from "./schemas";

/** 스키마가 받는 한도. 넘치면 프롬프트만 길어지고 판단은 나아지지 않는다. */
const MAX_ALLOWED_SLANG = 50;

export type AllowExpressionResult =
  | { kind: "added"; allowedSlang: string[] }
  | { kind: "already_allowed" }
  | { kind: "rejected"; reason: "empty" | "too_long" | "list_full" };

const EXPRESSION_LIMITS = ClassificationProfileSchema.shape.allowedSlang.element;

/**
 * 크리에이터가 확인한 표현을 허용 목록에 더한다.
 *
 * 이미 있는 말을 다시 눌렀을 때 목록이 불어나지 않게 한다. 크리에이터는
 * 같은 표현이 걸린 댓글을 여러 번 만나고, 그때마다 버튼을 누를 것이다.
 *
 * 등급을 바꾸지는 않는다. 앞으로 오는 댓글의 판단 재료가 하나 늘어날 뿐,
 * 이미 내려진 판단은 그대로 남는다.
 */
export const allowExpression = ({
  current,
  expression,
}: {
  current: string[];
  expression: string;
}): AllowExpressionResult => {
  const trimmed = expression.trim();

  if (trimmed.length === 0) return { kind: "rejected", reason: "empty" };
  if (!EXPRESSION_LIMITS.safeParse(trimmed).success) {
    return { kind: "rejected", reason: "too_long" };
  }

  const existing = current.map((value) => value.trim()).filter(Boolean);
  if (existing.includes(trimmed)) return { kind: "already_allowed" };
  if (existing.length >= MAX_ALLOWED_SLANG) {
    return { kind: "rejected", reason: "list_full" };
  }

  return { kind: "added", allowedSlang: [...existing, trimmed] };
};
