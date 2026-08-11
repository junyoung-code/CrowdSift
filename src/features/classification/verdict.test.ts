import { describe, expect, it } from "vitest";

import { decideVerdict } from "./verdict";
import type { RiskLevel, TerraVerdict } from "./schemas";

const cleanTerra: TerraVerdict = {
  verdictLevel: "safe",
  certainty: "clear",
  reasonCodes: [],
  hardRiskFlags: [],
  softRiskFlags: [],
  feedbackType: "actionable",
  feedbackActionable: true,
  feedbackCore: "편집 속도가 느리다",
  recommendedActions: ["show_source"],
  safetyCase: false,
};

const verdict = ({
  candidateLevel = "safe",
  terra,
  moderationMinimumLevel = null,
}: {
  candidateLevel?: RiskLevel;
  terra?: Partial<TerraVerdict>;
  moderationMinimumLevel?: RiskLevel | null;
}) =>
  decideVerdict({
    candidateLevel,
    terra: { ...cleanTerra, ...terra },
    moderationMinimumLevel,
  });

describe("final verdict", () => {
  it("confirms the level both passes reached", () => {
    const outcome = verdict({
      candidateLevel: "caution",
      terra: { verdictLevel: "caution" },
    });

    expect(outcome).toMatchObject({
      status: "decided",
      level: "caution",
      basis: "both_agreed",
      agreedWithFirstPass: true,
    });
  });

  describe("when the two passes disagree", () => {
    it("takes the protective side once danger is on the table", () => {
      for (const [candidateLevel, verdictLevel] of [
        ["danger", "caution"],
        ["safe", "danger"],
        ["caution", "danger"],
      ] as const) {
        const outcome = verdict({ candidateLevel, terra: { verdictLevel } });

        expect(outcome.level).toBe("danger");
        expect(outcome.basis).toBe("danger_in_either");
      }
    });

    it("lets the verifier lower caution to safe when it read the comment clearly", () => {
      // "아 개웃겨" on a channel that has not registered its slang yet. Without
      // this the first pass verdict is final and the compliment stays hidden.
      const outcome = verdict({
        candidateLevel: "caution",
        terra: { verdictLevel: "safe", certainty: "clear" },
      });

      expect(outcome.level).toBe("safe");
      expect(outcome.basis).toBe("verifier_decided_boundary");
      expect(outcome.hideSource).toBe(false);
    });

    it("keeps the protective side when the verifier was unsure at the boundary", () => {
      const outcome = verdict({
        candidateLevel: "caution",
        terra: { verdictLevel: "safe", certainty: "borderline" },
      });

      expect(outcome.level).toBe("caution");
      expect(outcome.basis).toBe("protective_on_boundary");
    });

    it("never lets the boundary rule reach danger", () => {
      // The lowering path exists for slang and memes. A confirmed attack must not
      // travel through it, whatever the verifier put in its level field.
      const outcome = verdict({
        candidateLevel: "danger",
        terra: { verdictLevel: "safe", certainty: "clear" },
      });

      expect(outcome.level).toBe("danger");
    });
  });

  describe("risks no setting can soften", () => {
    it("lands on danger when the verifier confirmed one", () => {
      const outcome = verdict({
        candidateLevel: "safe",
        terra: {
          verdictLevel: "caution",
          hardRiskFlags: ["stalking"],
          feedbackActionable: true,
        },
      });

      expect(outcome).toMatchObject({
        status: "decided",
        level: "danger",
        basis: "non_negotiable_risk_confirmed",
        allowRewrite: false,
        hideSource: true,
      });
    });

    it("decides rather than queueing even when the verifier hedged", () => {
      // Waiting for a person to confirm a threat leaves the comment unprotected
      // for as long as the queue is long.
      const outcome = verdict({
        terra: { certainty: "unclear", hardRiskFlags: ["threat"] },
      });

      expect(outcome.status).toBe("decided");
      expect(outcome.level).toBe("danger");
    });

    it("does not fire for a hard flag that settings may weigh", () => {
      // appearance_attack implies danger but is not on the non-negotiable list,
      // so it travels the ordinary route instead of overriding the level.
      const outcome = verdict({
        candidateLevel: "caution",
        terra: { verdictLevel: "caution", hardRiskFlags: ["appearance_attack"] },
      });

      expect(outcome.basis).toBe("both_agreed");
      expect(outcome.level).toBe("caution");
    });
  });

  describe("when the verifier could not decide", () => {
    it("leaves the level empty instead of guessing", () => {
      const outcome = verdict({
        candidateLevel: "caution",
        terra: { verdictLevel: "caution", certainty: "unclear" },
      });

      expect(outcome).toMatchObject({
        status: "review_queue",
        level: null,
        basis: "verifier_uncertain",
        allowRewrite: false,
        hideSource: true,
      });
    });

    it("keeps the verifier's notes for whoever picks it up", () => {
      const outcome = verdict({
        terra: {
          certainty: "unclear",
          recommendedActions: ["hide_source", "preserve_evidence"],
          safetyCase: true,
        },
      });

      expect(outcome.recommendedActions).toEqual([
        "hide_source",
        "preserve_evidence",
      ]);
      expect(outcome.safetyCase).toBe(true);
    });
  });

  describe("moderation as a floor", () => {
    it("raises a level the free filter puts higher", () => {
      const outcome = verdict({
        candidateLevel: "safe",
        terra: { verdictLevel: "safe" },
        moderationMinimumLevel: "danger",
      });

      expect(outcome.level).toBe("danger");
      expect(outcome.raisedByModeration).toBe(true);
    });

    it("never lowers a level the passes already agreed on", () => {
      const outcome = verdict({
        candidateLevel: "danger",
        terra: { verdictLevel: "danger" },
        moderationMinimumLevel: "caution",
      });

      expect(outcome.level).toBe("danger");
      expect(outcome.raisedByModeration).toBe(false);
    });
  });

  describe("whether a rewrite may be generated", () => {
    it("allows one for caution that carries something to work with", () => {
      const outcome = verdict({
        candidateLevel: "caution",
        terra: { verdictLevel: "caution", feedbackActionable: true },
      });

      expect(outcome.allowRewrite).toBe(true);
    });

    it("refuses one when there is nothing to rewrite", () => {
      // "개노잼" has no fixable point in it, so a rewrite would have to invent one.
      const outcome = verdict({
        candidateLevel: "caution",
        terra: {
          verdictLevel: "caution",
          feedbackActionable: false,
          feedbackCore: null,
        },
      });

      expect(outcome.allowRewrite).toBe(false);
    });

    it("refuses one for danger however useful the feedback looks", () => {
      const outcome = verdict({
        candidateLevel: "danger",
        terra: {
          verdictLevel: "danger",
          feedbackActionable: true,
          feedbackCore: "설명이 길다",
        },
      });

      expect(outcome.allowRewrite).toBe(false);
    });

    it("refuses one for safe, which needs no rewriting", () => {
      expect(verdict({}).allowRewrite).toBe(false);
    });
  });
});
