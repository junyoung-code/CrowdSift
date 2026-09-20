import "server-only";
import OpenAI from "openai";
import type { ResponsesClient } from "./semantic-openai";
import { createOpenAISemanticProviders } from "./semantic-openai";
import { createFixtureSemanticProviders } from "./semantic-fixtures";
import { semanticConfigurationKey, type SemanticSettings } from "./semantic-settings";

export function createSemanticProviders(settings: SemanticSettings, apiKey: string, allowFixture: boolean) {
  if (settings.provider === "fixture") {
    if (process.env.NODE_ENV === "production" || !allowFixture) throw new Error("fixture_disabled");
    return createFixtureSemanticProviders();
  }
  if (process.env.NODE_ENV === "production" && process.env.SEMANTIC_APPROVED_CONFIGURATION !== semanticConfigurationKey(settings, 1)) {
    throw new Error("semantic_quality_approval_required");
  }
  return createOpenAISemanticProviders(new OpenAI({ apiKey, timeout: 60_000, maxRetries: 1 }) as unknown as ResponsesClient, settings);
}
