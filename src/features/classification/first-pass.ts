import "server-only";

import type { FirstPassInput, FirstPassResult } from "./contracts";
import type { LunaFirstPassClassifier } from "./luna-first-pass";
import type { ModerationScreen } from "./moderation";

export type FirstPassRunner = {
  run(input: FirstPassInput): Promise<FirstPassResult>;
};

/**
 * 1단계 실행기.
 *
 * 1-A(Moderation)와 1-B(Luna)를 동시에 돌리고, 두 결과를 합치지 않고 나란히 돌려준다.
 * 등급 확정은 2번 분기가 맡는다.
 *
 * Moderation 은 보조 필터이므로 실패해도 분류를 멈추지 않는다. 대신 결과를 비워 두어
 * 2번 분기가 "신호 없음"과 "확인하지 못함"을 구분할 수 있게 한다.
 */
export const createFirstPassRunner = ({
  luna,
  moderation,
  now = () => new Date(),
  onModerationError,
}: {
  luna: LunaFirstPassClassifier;
  moderation: ModerationScreen;
  now?: () => Date;
  onModerationError?: (error: unknown, commentId: string) => void;
}): FirstPassRunner => ({
  async run(input) {
    const [moderationOutcome, lunaOutcome] = await Promise.allSettled([
      moderation.screen(input.sourceText),
      luna.classify(input),
    ]);

    if (lunaOutcome.status === "rejected") {
      throw lunaOutcome.reason;
    }

    if (moderationOutcome.status === "rejected") {
      onModerationError?.(moderationOutcome.reason, input.commentId);
    }

    return {
      commentId: input.commentId,
      workspaceId: input.workspaceId,
      moderation:
        moderationOutcome.status === "fulfilled"
          ? moderationOutcome.value
          : null,
      luna: lunaOutcome.value,
      promptVersion: luna.promptVersion,
      evaluatedAt: now().toISOString(),
    };
  },
});
