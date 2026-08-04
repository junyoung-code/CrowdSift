import "server-only";

import {
  ModerationCategorySchema,
  type ModerationCategory,
  type ModerationResult,
} from "./schemas";

type ModerationApiResult = {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
};

export type ModerationClient = {
  moderations: {
    create(input: {
      model: string;
      input: string;
    }): Promise<{ results: ModerationApiResult[] }>;
  };
};

const splitFlaggedCategories = (flags: Record<string, boolean>) => {
  const known: ModerationCategory[] = [];
  const unknown: string[] = [];

  for (const [name, isSet] of Object.entries(flags)) {
    if (!isSet) continue;

    const parsed = ModerationCategorySchema.safeParse(name);

    if (parsed.success) {
      known.push(parsed.data);
    } else {
      // 모더레이션 모델은 업데이트되면서 범주가 늘어난다. 모르는 범주를 버리면
      // 새 위험 신호가 조용히 사라지므로, 분기 단계가 보고 판단하게 넘긴다.
      unknown.push(name);
    }
  }

  return { known, unknown };
};

/**
 * 1-A. 무료 유해성 필터.
 *
 * 최종 분류기가 아니라 위험 신호 보조 필터다. 여기서 나온 결과만으로 등급을 정하지 않고,
 * 2번 분기가 Luna 후보와 함께 읽는다.
 */
export const createModerationScreen = ({
  client,
  model,
}: {
  client: ModerationClient;
  model: string;
}) => ({
  async screen(text: string): Promise<{
    result: ModerationResult;
    model: string;
    latencyMs: number;
  }> {
    const startedAt = Date.now();
    const response = await client.moderations.create({ model, input: text });
    const first = response.results[0];

    if (!first) {
      throw new Error("moderation_response_empty");
    }

    const flaggedCategories = splitFlaggedCategories(first.categories);

    return {
      result: {
        flagged: first.flagged,
        categories: flaggedCategories.known,
        unknownCategories: flaggedCategories.unknown,
        categoryScores: first.category_scores,
      },
      model,
      latencyMs: Date.now() - startedAt,
    };
  },
});

export type ModerationScreen = ReturnType<typeof createModerationScreen>;
