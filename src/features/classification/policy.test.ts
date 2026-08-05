import { describe, expect, it } from "vitest";

import {
  LUNA_SAFE_PASS_CONFIDENCE,
  MODERATION_CATEGORY_POLICY,
  TERRA_REVIEW_QUEUE_CONFIDENCE,
  treatmentForCategory,
} from "./policy";
import { ModerationCategorySchema } from "./schemas";

describe("classification policy", () => {
  it("keeps the review-queue bar below the instant-pass bar", () => {
    expect(TERRA_REVIEW_QUEUE_CONFIDENCE).toBeLessThan(
      LUNA_SAFE_PASS_CONFIDENCE,
    );
  });

  it("covers every category the filter can return", () => {
    // A category with no entry would fall through to the default and lose its
    // "hide the source first" rule.
    for (const category of ModerationCategorySchema.options) {
      expect(MODERATION_CATEGORY_POLICY).toHaveProperty(category);
    }
  });

  it("hides the source first for the categories that mean immediate harm", () => {
    for (const category of [
      "harassment/threatening",
      "hate/threatening",
      "self-harm/instructions",
      "sexual/minors",
      "illicit/violent",
    ] as const) {
      expect(treatmentForCategory(category).hideSourceBeforeVerdict).toBe(true);
    }
  });

  it("does not let a violence hit decide the level on its own", () => {
    // Film, game and news talk lands here constantly, so a verdict at this point
    // would bury ordinary comments about a horror game.
    expect(treatmentForCategory("violence").minimumCandidate).toBeNull();
    expect(treatmentForCategory("illicit").minimumCandidate).toBeNull();
    expect(treatmentForCategory("sexual").minimumCandidate).toBeNull();
  });

  it("marks self-harm signals as possibly about the writer, not the creator", () => {
    expect(treatmentForCategory("self-harm").maySignalSelfHarmCase).toBe(true);
    expect(treatmentForCategory("self-harm/intent").maySignalSelfHarmCase).toBe(
      true,
    );
    // Telling the creator to harm themselves is an attack, not a cry for help.
    expect(
      treatmentForCategory("self-harm/instructions").maySignalSelfHarmCase,
    ).toBe(false);
    expect(treatmentForCategory("self-harm/instructions").minimumCandidate).toBe(
      "danger",
    );
  });

  it("falls back to a level-free treatment for a category it has never seen", () => {
    const unknown = treatmentForCategory("brand-new/category");

    expect(unknown.minimumCandidate).toBeNull();
    expect(unknown.hideSourceBeforeVerdict).toBe(false);
    expect(unknown.maySignalSelfHarmCase).toBe(false);
  });
});
