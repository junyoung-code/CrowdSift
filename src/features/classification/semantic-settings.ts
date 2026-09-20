import { z } from "zod";
import { createHash } from "node:crypto";
import { SEMANTIC_PIPELINE_VERSION, SEMANTIC_POLICY_VERSION } from "./semantic-contracts";
import { semanticPromptsFor } from "./semantic-prompts";

export const ModelSettingSchema = z.object({
  model: z.string().min(1),
  effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).nullable(),
}).strict();
export const SemanticSettingsSchema = z.object({
  provider: z.enum(["live", "fixture"]),
  analysis: ModelSettingSchema, rewrite: ModelSettingSchema, validation: ModelSettingSchema,
  interpretationProfile: z.enum(["context-v1", "context-v2", "context-v3"]).optional(),
  // Offline comparison only. Omission retains the historical OpenAI route.
  analysisProvider: z.literal("anthropic").optional(),
}).strict();
export type SemanticSettings = z.infer<typeof SemanticSettingsSchema>;

/** No production model is silently selected. Unconfigured settings can be hashed, not executed. */
export function semanticSettingsFromEnv(env: Record<string, string | undefined> = process.env): SemanticSettings {
  const fixture = env.EXTERNAL_PROVIDER_MODE === "fixture";
  const role = (name: string) => ({
    model: fixture ? "fixture-semantic-v1" : env[`OPENAI_${name}_MODEL`] || "unconfigured",
    effort: env[`OPENAI_${name}_REASONING_EFFORT`] || null,
  });
  return SemanticSettingsSchema.parse({
    provider: fixture ? "fixture" : "live",
    analysis: role("SEMANTIC"),
    rewrite: role("FEEDBACK_REWRITE"),
    validation: role("REWRITE_VALIDATION"),
    interpretationProfile: env.SEMANTIC_INTERPRETATION_PROFILE || undefined,
  });
}
export function semanticConfigurationKey(settings: SemanticSettings, policyVersion: number) {
  const normalized = SemanticSettingsSchema.parse(settings);
  // Preserve historical v1 keys, including when the default is explicitly selected.
  if (normalized.interpretationProfile === "context-v1") delete normalized.interpretationProfile;
  const profile = normalized.interpretationProfile ?? "context-v1";
  return `${SEMANTIC_PIPELINE_VERSION}:${policyVersion}:` + createHash("sha256").update(JSON.stringify({
    settings: normalized, schema: profile === "context-v3" ? "semantic-output-v2" : "semantic-output-v1", policyVersion, pipeline: SEMANTIC_PIPELINE_VERSION, policy: profile === "context-v1" ? SEMANTIC_POLICY_VERSION : "creator-feedback-context-v2",
    prompts: semanticPromptsFor(profile).versions,
    ...(normalized.analysisProvider === "anthropic" ? { analysisAdapter: "anthropic-analysis-v1", maxOutputTokens: 4096, thinking: "adaptive" } : {}),
  })).digest("hex");
}
