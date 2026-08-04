import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createModerationScreen, type ModerationClient } from "./moderation";

const clientReturning = (
  result: Partial<{
    flagged: boolean;
    categories: Record<string, boolean>;
    category_scores: Record<string, number>;
  }>,
) =>
  ({
    moderations: {
      create: vi.fn().mockResolvedValue({
        results: [
          {
            flagged: false,
            categories: {},
            category_scores: {},
            ...result,
          },
        ],
      }),
    },
  }) as unknown as ModerationClient;

describe("moderation screen", () => {
  it("reports the categories the filter actually flagged", async () => {
    const screen = createModerationScreen({
      client: clientReturning({
        flagged: true,
        categories: { harassment: true, hate: false, violence: true },
        category_scores: { harassment: 0.91, hate: 0.02, violence: 0.66 },
      }),
      model: "omni-moderation-latest",
    });

    const outcome = await screen.screen("너 같은 인간은 유튜브 하면 안 된다");

    expect(outcome.result.flagged).toBe(true);
    expect(outcome.result.categories).toEqual(["harassment", "violence"]);
    expect(outcome.result.unknownCategories).toEqual([]);
    expect(outcome.result.categoryScores.harassment).toBe(0.91);
  });

  it("surfaces a category it has no policy for instead of dropping it", async () => {
    const screen = createModerationScreen({
      client: clientReturning({
        flagged: true,
        // The filter gains categories over time. Swallowing an unknown one would
        // read as "nothing else was flagged" and lose a real risk signal.
        categories: { harassment: true, "brand-new/category": true },
        category_scores: { harassment: 0.8, "brand-new/category": 0.7 },
      }),
      model: "omni-moderation-latest",
    });

    const outcome = await screen.screen("아무 댓글");

    expect(outcome.result.categories).toEqual(["harassment"]);
    expect(outcome.result.unknownCategories).toEqual(["brand-new/category"]);
    expect(outcome.result.categoryScores["brand-new/category"]).toBe(0.7);
  });

  it("ignores categories the filter did not flag", async () => {
    const screen = createModerationScreen({
      client: clientReturning({
        flagged: false,
        categories: { harassment: false, "brand-new/category": false },
        category_scores: { harassment: 0.02, "brand-new/category": 0.01 },
      }),
      model: "omni-moderation-latest",
    });

    const outcome = await screen.screen("마이크 소리가 작게 들립니다");

    expect(outcome.result.categories).toEqual([]);
    expect(outcome.result.unknownCategories).toEqual([]);
  });

  it("fails loudly when the filter returns no result", async () => {
    const client = {
      moderations: { create: vi.fn().mockResolvedValue({ results: [] }) },
    } as unknown as ModerationClient;

    await expect(
      createModerationScreen({
        client,
        model: "omni-moderation-latest",
      }).screen("아무 댓글"),
    ).rejects.toThrow("moderation_response_empty");
  });
});
