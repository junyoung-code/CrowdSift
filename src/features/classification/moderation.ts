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

const toCategories = (flags: Record<string, boolean>): ModerationCategory[] => {
  const flagged: ModerationCategory[] = [];

  for (const [name, isSet] of Object.entries(flags)) {
    if (!isSet) continue;

    const known = ModerationCategorySchema.safeParse(name);
    // 새 범주가 추가되어도 점수는 categoryScores 에 그대로 남으므로 버리지 않는다.
    if (known.success) {
      flagged.push(known.data);
    }
  }

  return flagged;
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

    return {
      result: {
        flagged: first.flagged,
        categories: toCategories(first.categories),
        categoryScores: first.category_scores,
      },
      model,
      latencyMs: Date.now() - startedAt,
    };
  },
});

export type ModerationScreen = ReturnType<typeof createModerationScreen>;
