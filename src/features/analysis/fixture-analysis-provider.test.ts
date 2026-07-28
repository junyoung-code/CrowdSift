import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { FixtureAnalysisProvider } from "./fixture-analysis-provider";

describe("FixtureAnalysisProvider", () => {
  it("marks persisted model output as fixture provenance with zero usage", async () => {
    const provider = new FixtureAnalysisProvider();

    const result = await provider.summarizeDashboard({
      analysisCount: 20,
    });

    expect(result).toMatchObject({
      provider: "fixture",
      modelIdentifier: "fixture-analysis-v1",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    });
  });
});
