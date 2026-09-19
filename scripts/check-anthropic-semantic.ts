/** One synthetic API request. No dataset, database, rewrite or automatic retry. */
import Anthropic from "@anthropic-ai/sdk";
import { loadEnvConfig } from "@next/env";
import { createAnthropicSemanticAnalyzer } from "../src/features/classification/semantic-anthropic";
import { validateSemanticAnalysis } from "../src/features/classification/semantic-contracts";
import { classifySemanticAnalysis } from "../src/features/classification/semantic-policy";
import { SemanticSettingsSchema } from "../src/features/classification/semantic-settings";

async function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const model = option("--model");
  if (!model) throw new Error("Usage: check-anthropic-semantic.ts --model MODEL [--effort medium]");
  loadEnvConfig(process.cwd(), true);
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY_not_configured");
  const role = { model, effort: option("--effort") ?? "medium" };
  const settings = SemanticSettingsSchema.parse({ provider: "live", analysisProvider: "anthropic", interpretationProfile: "context-v2", analysis: role, rewrite: role, validation: role });
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 0,
    ...(process.env.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } } : {}),
  });
  const context = { commentId: "anthropic-connection-check", workspaceId: "offline-evaluation", sourceText: "자막이 조금 더 컸으면 좋겠어요.", videoTitle: "연결 확인용 예시 영상", parent: null, allowedContexts: [], corrections: [] };
  const output = await createAnthropicSemanticAnalyzer(client, settings).analyze(context);
  const analysis = validateSemanticAnalysis(output.result, context.sourceText);
  console.log(JSON.stringify({ syntheticConnectionCheck: true, analysis, verdict: classifySemanticAnalysis(analysis, context.sourceText), run: output.run }, null, 2));
}
main().catch(error => {
  // SDK errors may contain request details; print only safe diagnostics.
  if (error instanceof Anthropic.APIError) console.error(JSON.stringify({ error: error.name, status: error.status, requestId: error.requestID }));
  else console.error(error instanceof Error ? error.message : "anthropic_connection_failed");
  process.exitCode = 1;
});
