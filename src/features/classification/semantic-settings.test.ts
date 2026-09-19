import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { semanticConfigurationKey, semanticSettingsFromEnv, SemanticSettingsSchema } from "./semantic-settings";
import { semanticPromptsFor } from "./semantic-prompts";

describe("interpretation profiles", () => {
  const settings = semanticSettingsFromEnv({ EXTERNAL_PROVIDER_MODE: "fixture" });
  it("preserves the historical configuration key and operational default", () => {
    const legacy = "semantic-v1:1:" + createHash("sha256").update(JSON.stringify({ settings, schema: "semantic-output-v1", policyVersion: 1, pipeline: "semantic-v1", policy: "creator-feedback-v1", prompts: ["semantic-analysis-v1", "semantic-rewrite-v1", "semantic-rewrite-validation-v1"] })).digest("hex");
    expect(semanticConfigurationKey(settings, 1)).toBe(legacy);
    expect(semanticConfigurationKey({ ...settings, interpretationProfile: "context-v1" }, 1)).toBe(legacy);
    expect(settings.interpretationProfile).toBeUndefined();
  });
  it("isolates the new boundary policy and all three prompts", () => {
    const v2 = { ...settings, interpretationProfile: "context-v2" as const };
    expect(semanticConfigurationKey(v2, 1)).not.toBe(semanticConfigurationKey(settings, 1));
    for (const role of ["analysis", "rewrite", "validation"] as const) expect(semanticPromptsFor("context-v2")[role]).not.toBe(semanticPromptsFor()[role]);
    expect(() => SemanticSettingsSchema.parse({ ...settings, interpretationProfile: "typo" })).toThrow();
  });
});
