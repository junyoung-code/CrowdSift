import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SemanticDatasetSchema, digest, evaluateSemanticRun, validateDataset, type EvaluationRow } from "./semantic-evaluation";
import { SemanticSettingsSchema, semanticConfigurationKey } from "../features/classification/semantic-settings";
const releaseGate = process.env.EVALUATION_RELEASE_GATE === "true" ? it : it.skip;
describe("semantic release gate", () => {
  releaseGate("requires human-reviewed holdout data and three qualifying live runs of one configuration", () => {
    const datasetPath = process.env.SEMANTIC_EVALUATION_DATASET;
    const reportPath = process.env.SEMANTIC_EVALUATION_REPORT;
    if (!datasetPath || !reportPath) throw new Error("Set SEMANTIC_EVALUATION_DATASET and SEMANTIC_EVALUATION_REPORT; fixture output cannot approve release");
    const dataset = SemanticDatasetSchema.parse(JSON.parse(readFileSync(datasetPath,"utf8")));
    validateDataset(dataset.cases);
    const cases=dataset.cases.filter(c=>c.split==="holdout");
    const report=JSON.parse(readFileSync(reportPath,"utf8")) as {schemaVersion:string;mode:string;datasetDigest:string;runs:{name:string;settings:unknown;configurationKey:string;repetition:number;rows:EvaluationRow[]}[]};
    expect(report.schemaVersion).toBe("semantic-evaluation-report-v1");expect(report.mode).toBe("--live");expect(report.datasetDigest).toBe(digest(cases));
    const names=[...new Set(report.runs.map(r=>r.name))];
    const qualified=names.filter(name=>{
      const runs=report.runs.filter(r=>r.name===name);
      return runs.length===3 && new Set(runs.map(r=>r.repetition)).size===3 && new Set(runs.map(r=>r.configurationKey)).size===1 && runs.every(r=>{
        const settings=SemanticSettingsSchema.parse(r.settings);
        return settings.provider==="live" && r.configurationKey===semanticConfigurationKey(settings,1) && evaluateSemanticRun(cases,r.rows).releasePassed;
      });
    });
    expect(qualified.length).toBeGreaterThan(0);
  });
});
