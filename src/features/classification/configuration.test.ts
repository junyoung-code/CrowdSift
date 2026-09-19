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
});
