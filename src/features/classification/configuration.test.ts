import { describe, expect, it } from "vitest";
import { semanticConfigurationKey, semanticSettingsFromEnv } from "./semantic-settings";

const settings = semanticSettingsFromEnv({ EXTERNAL_PROVIDER_MODE: "fixture" });
describe("semantic configuration identity", () => {
  it("is stable and includes policy version", () => {
    expect(semanticConfigurationKey(settings, 1)).toBe(semanticConfigurationKey(structuredClone(settings), 1));
    expect(semanticConfigurationKey(settings, 2)).not.toBe(semanticConfigurationKey(settings, 1));
  });
  it.each(["analysis", "rewrite", "validation"] as const)("includes %s model and reasoning", role => {
    for (const change of [{ model: "another-model" }, { effort: "high" as const }]) {
      const next = { ...settings, [role]: { ...settings[role], ...change } };
      expect(semanticConfigurationKey(next, 1)).not.toBe(semanticConfigurationKey(settings, 1));
    }
  });
  it("does not choose a live default model", () => {
    expect(semanticSettingsFromEnv({}).analysis.model).toBe("unconfigured");
    expect(() => semanticSettingsFromEnv({ OPENAI_SEMANTIC_REASONING_EFFORT: "invented" })).toThrow();
  });
  it("loads the explicitly selected interpretation profile", () => {
    expect(semanticSettingsFromEnv({ SEMANTIC_INTERPRETATION_PROFILE: "context-v3" }).interpretationProfile).toBe("context-v3");
    expect(() => semanticSettingsFromEnv({ SEMANTIC_INTERPRETATION_PROFILE: "context-v4" })).toThrow();
  });
  it("reproduces the approved Luna context-v3 experiment identity", () => {
    const v3 = semanticSettingsFromEnv({
      OPENAI_SEMANTIC_MODEL: "gpt-5.6-luna",
      OPENAI_SEMANTIC_REASONING_EFFORT: "medium",
      OPENAI_FEEDBACK_REWRITE_MODEL: "gpt-5.6-luna",
      OPENAI_FEEDBACK_REWRITE_REASONING_EFFORT: "low",
      OPENAI_REWRITE_VALIDATION_MODEL: "gpt-5.6-luna",
      OPENAI_REWRITE_VALIDATION_REASONING_EFFORT: "medium",
      SEMANTIC_INTERPRETATION_PROFILE: "context-v3",
    });
    expect(semanticConfigurationKey(v3, 1)).toBe(
      "semantic-v1:1:1caf1dc6e215a2c6f21bdc3f9aeecb5f2d07c2c81c0104b1912c3ed7c6f4df95",
    );
  });
});
