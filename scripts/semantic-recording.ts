import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { createAnthropicSemanticAnalyzer } from "../src/features/classification/semantic-anthropic";
import { createOpenAISemanticProviders } from "../src/features/classification/semantic-openai";
import { createFixtureSemanticProviders } from "../src/features/classification/semantic-fixtures";
import type { ResponsesClient } from "../src/features/classification/semantic-openai";
import { validateSemanticAnalysis, type SemanticContext, type SemanticProviders } from "../src/features/classification/semantic-contracts";
import { runSemanticPipeline, type SemanticState } from "../src/features/classification/semantic-service";
import { semanticConfigurationKey, type SemanticSettings } from "../src/features/classification/semantic-settings";
import { digest, type EvaluationRow } from "../src/evaluation/semantic-evaluation";

export type Recording = { schemaVersion: "semantic-recording-v1"; contextDigest: string; state: SemanticState; result: Awaited<ReturnType<typeof runSemanticPipeline>> | null; error: string | null; elapsedMs: number };
export function providersFor(settings: SemanticSettings): SemanticProviders {
  if (settings.provider === "fixture") return createFixtureSemanticProviders();
  const { analysisProvider, ...openaiSettings } = settings;
  if (analysisProvider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY_not_configured");
    if ([settings.rewrite, settings.validation].some(role => role.model.startsWith("claude-"))) throw new Error("claude_supported_for_analysis_only");
    // Only these two OpenAI roles are used; never send a Claude model to OpenAI.
    const analyzer = createAnthropicSemanticAnalyzer(new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 0,
      ...(process.env.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } } : {}),
    }), settings);
    const providers = createOpenAISemanticProviders(new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 2 }) as unknown as ResponsesClient, { ...openaiSettings, analysis: settings.rewrite });
    return { ...providers, analyzer };
  }
  if (settings.analysis.model.startsWith("claude-")) throw new Error("claude_requires_analysis_provider_anthropic");
  return createOpenAISemanticProviders(new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 2 }) as unknown as ResponsesClient, openaiSettings);
}
export const offlineProviders: SemanticProviders = {
  analyzer: { async analyze() { throw new Error("replay_missing_analysis"); } },
  rewriter: { async rewrite() { throw new Error("replay_missing_rewrite"); } },
  validator: { async validate() { throw new Error("replay_missing_validation"); } },
};
export async function recordSemantic(context: SemanticContext, settings: SemanticSettings, providers: SemanticProviders, saved?: Recording, checkpoint: (value: Recording) => void = () => {}) {
  const configurationKey = semanticConfigurationKey(settings, 1);
  if (saved && (saved.schemaVersion !== "semantic-recording-v1" || saved.contextDigest !== digest(context) || saved.state.snapshot.configurationKey !== configurationKey)) throw new Error("recording_context_or_configuration_mismatch");
  const state: SemanticState = saved ? structuredClone(saved.state) : { snapshot: { context, settings, configurationKey }, attempts: [], verdict: null, rewriteStatus: "pending" };
  const record: Recording = { schemaVersion: "semantic-recording-v1", contextDigest: digest(context), state, result: null, error: null, elapsedMs: 0 };
  const start = Date.now();
  try {
    record.result = await runSemanticPipeline(state, providers, {
      async saveAttempt(attempt) { state.attempts.push(attempt); checkpoint(record); },
      async saveVerdict(verdict) { state.verdict = verdict; checkpoint(record); },
      async saveRewrite(_rewrite, status) { state.rewriteStatus = status; checkpoint(record); },
    });
  } catch (error) { record.error = error instanceof Error ? `${error.name}:${error.message}` : "unknown_error"; }
  record.elapsedMs = saved?.elapsedMs ?? Date.now() - start; checkpoint(record);
  return record;
}
export function evaluationRow(id: string, record: Recording, prices?: Record<string, { inputPerMillion: number; outputPerMillion: number }>): EvaluationRow {
  const runs = record.state.attempts.flatMap(a => a.run ? [a.run] : []);
  const savedAnalysis = record.state.attempts.filter(a=>a.stage==="semantic_analysis"&&a.status==="succeeded").at(-1);
  const analysis = record.result?.analysis ?? (savedAnalysis ? validateSemanticAnalysis(savedAnalysis.output, record.state.snapshot.context, record.state.snapshot.settings.interpretationProfile) : null);
  const usageComplete = record.state.attempts.every(a=>a.run!==null);
  return { id, level: record.error ? null : record.result?.verdict.level ?? null, analysis, error: record.error, usageComplete,
    errorStage: record.error ? record.state.attempts.filter(a=>a.status==="failed").at(-1)?.stage ?? "pipeline" : null,
    latencyMs: record.elapsedMs, inputTokens: runs.reduce((s,r)=>s+r.usage.inputTokens,0), outputTokens:runs.reduce((s,r)=>s+r.usage.outputTokens,0),
    cost: usageComplete && runs.every(r=>prices?.[r.model]) ? runs.reduce((s,r)=>s+(r.usage.inputTokens*prices![r.model].inputPerMillion+r.usage.outputTokens*prices![r.model].outputPerMillion)/1e6,0) : null,
    rewriteStatus: record.result?.rewriteStatus ?? null, rewriteText: record.result?.rewrite?.text ?? null };
}
export function atomicSave(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(value,null,2)+"\n",{mode:0o600}); renameSync(`${path}.tmp`,path);
}
