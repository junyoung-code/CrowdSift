/** One exploratory live pass. Human labels never enter model context. No DB writes. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { z } from "zod";
import { digest, SemanticDatasetSchema, validateDataset } from "../src/evaluation/semantic-evaluation";
import { semanticConfigurationKey, SemanticSettingsSchema } from "../src/features/classification/semantic-settings";
import { atomicSave, providersFor, recordSemantic } from "./semantic-recording";
import { buildComparisonDocument, comparisonStats, type ComparisonReport } from "./semantic-comparison-report";
import { comparisonSummary, validateComparisonBaseline, validateComparisonResume, type ComparisonOptions } from "./semantic-comparison-context";

async function main() {
  const [input, outputDirectory, ...args] = process.argv.slice(2);
  const option = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const model = option("--model");
  if (!input || !outputDirectory || !model) throw new Error("Usage: dataset.json output-directory --model MODEL [--analysis-provider anthropic --rewrite-model MODEL --validation-model MODEL] [--profile context-v2] [--baseline comparison.json --original-dataset dataset.json] [--prices prices.json] [--resume]");
  const analysisProvider = option("--analysis-provider");
  if (args.includes("--analysis-provider") && analysisProvider !== "anthropic") throw new Error("unsupported_analysis_provider");
  if (analysisProvider && (!option("--rewrite-model") || !option("--validation-model"))) throw new Error("anthropic_comparison_requires_explicit_openai_rewrite_and_validation_models");
  loadEnvConfig(process.cwd(), true);
  const settings = SemanticSettingsSchema.parse({ provider: "live",
    analysis: { model, effort: option("--effort") ?? null },
    rewrite: { model: option("--rewrite-model") ?? model, effort: option("--rewrite-effort") ?? option("--effort") ?? null },
    validation: { model: option("--validation-model") ?? model, effort: option("--validation-effort") ?? option("--effort") ?? null },
    ...(option("--profile") ? { interpretationProfile: option("--profile") } : {}),
    ...(analysisProvider ? { analysisProvider } : {}),
  });
  const dataset = SemanticDatasetSchema.parse(JSON.parse(readFileSync(resolve(input), "utf8")));
  validateDataset(dataset.cases);
  const readJson = (path: string) => JSON.parse(readFileSync(resolve(path), "utf8"));
  const options: ComparisonOptions = {
    presentation: option("--presentation") ? z.object({ title: z.string(), note: z.string(), baselineLabel: z.string(), sourceNumbers: z.record(z.string(), z.number().int().positive()) }).strict().parse(readJson(option("--presentation")!)) : undefined,
    baseline: option("--baseline") ? readJson(option("--baseline")!) : undefined,
    originalCases: option("--original-dataset") ? SemanticDatasetSchema.parse(readJson(option("--original-dataset")!)).cases : undefined,
    prices: option("--prices") ? z.record(z.string(), z.object({ inputPerMillion: z.number().nonnegative(), outputPerMillion: z.number().nonnegative() }).strict()).parse(readJson(option("--prices")!)) : undefined,
  };
  validateComparisonBaseline(dataset.cases, options);
  const dir = resolve(outputDirectory); mkdirSync(dir, { recursive: true });
  const path = resolve(dir, "comparison.json"), htmlPath = resolve(dir, "comparison.html");
  if (existsSync(path) && !args.includes("--resume")) throw new Error("Output exists; use --resume with identical input/settings or choose a new directory");
  const report: ComparisonReport = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {
    schemaVersion: "semantic-human-comparison-v1", datasetDigest: digest(dataset.cases), settings,
    configurationKey: semanticConfigurationKey(settings, 1),
    ...(options.baseline ? { baselineDigest: digest(options.baseline) } : {}),
    ...(options.originalCases ? { originalDatasetDigest: digest(options.originalCases) } : {}),
    ...(options.prices ? { prices: options.prices } : {}),
    ...(options.presentation ? { presentation: options.presentation } : {}),
    startedAt: new Date().toISOString(), finishedAt: null, records: {},
  };
  validateComparisonResume(report, dataset.cases, settings, options);
  const save = () => { atomicSave(path, report); writeFileSync(`${htmlPath}.tmp`, buildComparisonDocument(dataset.cases, report, options), { mode: 0o600 }); renameSync(`${htmlPath}.tmp`, htmlPath); };
  report.finishedAt = null; save();
  const providers = providersFor(settings);
  let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < dataset.cases.length) {
      const c = dataset.cases[cursor++];
      const saved = report.records[c.id];
      if (saved?.result && !saved.error) continue;
      await recordSemantic({ commentId: c.id, workspaceId: "offline-evaluation", sourceText: c.sourceText, videoTitle: c.videoTitle, parent: c.parentText ? { id: `${c.group}-parent`, text: c.parentText } : null, allowedContexts: [], corrections: [] }, settings, providers, saved, record => { report.records[c.id] = record; save(); });
      const stats = comparisonStats(dataset.cases, report);
      console.log(`${stats.completed}/${stats.total}: matched=${stats.matched}/${stats.compared}, errors=${stats.errors}`);
    }
  }));
  report.finishedAt = new Date().toISOString(); save();
  atomicSave(resolve(dir, "summary.json"), comparisonSummary(dataset.cases, report, options));
  console.log(JSON.stringify(comparisonStats(dataset.cases, report)));
  if (Object.values(report.records).some(r => r.error)) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
