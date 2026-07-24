import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createAnalysisProviderFactory } from "./analysis-provider";

describe("analysis provider factory", () => {
  it("refuses fixture providers in production", () => {
    expect(() =>
      createAnalysisProviderFactory({
        externalProviderMode: "fixture",
        nodeEnv: "production",
        allowFixtureProviders: true,
        openAI: {
          stageOneModel: "stage-one-model",
          stageTwoModel: "stage-two-model",
          embeddingModel: "embedding-model",
        },
      }),
    ).toThrow("Fixture providers are test-only");
  });

  it("requires the explicit non-production fixture opt in", () => {
    expect(() =>
      createAnalysisProviderFactory({
        externalProviderMode: "fixture",
        nodeEnv: "test",
        allowFixtureProviders: false,
        openAI: {
          stageOneModel: "stage-one-model",
          stageTwoModel: "stage-two-model",
          embeddingModel: "embedding-model",
        },
      }),
    ).toThrow("Fixture providers are disabled");
  });

  it("returns deterministic schema-valid analysis and a 1536-dimension embedding", async () => {
    const provider = createAnalysisProviderFactory({
      externalProviderMode: "fixture",
      nodeEnv: "test",
      allowFixtureProviders: true,
      openAI: {
        stageOneModel: "stage-one-model",
        stageTwoModel: "stage-two-model",
        embeddingModel: "embedding-model",
      },
    });
    const embedding = await provider.embed("테스트 댓글");

    expect(embedding.model).toBe("fixture-embedding-1536");
    expect(embedding.vector).toHaveLength(1536);
  });
});
