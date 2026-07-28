import { describe, expect, it, vi } from "vitest";

import {
  parsePolicyPhraseLines,
  saveCreatorPolicyVersion,
  type CreatorPolicyRepository,
} from "./policy-service";

describe("parsePolicyPhraseLines", () => {
  it("trims, removes empty lines, and deduplicates phrases", () => {
    expect(parsePolicyPhraseLines("  광고\n\n사기\n광고  ")).toEqual([
      "광고",
      "사기",
    ]);
  });
});

describe("saveCreatorPolicyVersion", () => {
  it("creates a new version through one repository transaction", async () => {
    const repository: CreatorPolicyRepository = {
      createVersion: vi.fn().mockResolvedValue({
        policyId: "policy-2",
        version: 2,
      }),
    };

    const result = await saveCreatorPolicyVersion({
      repository,
      workspaceId: "workspace-1",
      actorUserId: "user-1",
      blocked: "광고\n사기",
      allowed: "팬들끼리 쓰는 말",
      contextExceptions: "칭찬으로 쓰는 표현",
      sensitivity: "standard",
      cautionAction: "review",
      riskAction: "hold_for_review",
      harmfulTextHidden: true,
    });

    expect(result.version).toBe(2);
    expect(repository.createVersion).toHaveBeenCalledTimes(1);
    expect(repository.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        phraseRules: expect.arrayContaining([
          expect.objectContaining({ kind: "blocked", phrase: "광고" }),
          expect.objectContaining({
            kind: "context_exception",
            phrase: "칭찬으로 쓰는 표현",
          }),
        ]),
      }),
    );
  });
});
