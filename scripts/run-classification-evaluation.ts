/** No database writes. Live calls require --live and explicit settings. */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { z } from "zod";
import { AlignmentSchema, SemanticDatasetSchema, digest, evaluateSemanticRun, repetitionConsistency, validateDataset, type EvaluationRow } from "../src/evaluation/semantic-evaluation";
import { SemanticSettingsSchema, semanticSettingsFromEnv, semanticConfigurationKey } from "../src/features/classification/semantic-settings";
import { validateSemanticAnalysis } from "../src/features/classification/semantic-contracts";
import { classifySemanticAnalysis } from "../src/features/classification/semantic-policy";
import { atomicSave, evaluationRow, offlineProviders, providersFor, recordSemantic, type Recording } from "./semantic-recording";

async function main() {
  const args=process.argv.slice(2);
  const option=(name:string)=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
  const input=args[0], output=option("--output");
  if(!input||!output) throw new Error("Usage: dataset.json --output report.json [--fixture | --live --matrix settings.json | --replay report.json | --policy-only] [--alignments reviews.json] [--prices prices.json]");
  const modes=["--fixture","--live","--replay","--policy-only"].filter(m=>args.includes(m));
  if(modes.length!==1) throw new Error("Select exactly one execution mode");
  const path=resolve(output);
  if(existsSync(path)) throw new Error("Output exists; choose a new path to preserve the previous run");
  const dataset=SemanticDatasetSchema.parse(JSON.parse(readFileSync(resolve(input),"utf8"))); validateDataset(dataset.cases);
  const cases=option("--split")?dataset.cases.filter(c=>c.split===option("--split")):dataset.cases;
  if(!cases.length) throw new Error("No cases selected");
  const read=(p:string)=>JSON.parse(readFileSync(resolve(p),"utf8"));
  const alignments=option("--alignments")?z.array(AlignmentSchema).parse(read(option("--alignments")!)):[];
  const prices=option("--prices")?z.record(z.string(),z.object({inputPerMillion:z.number().nonnegative(),outputPerMillion:z.number().nonnegative()})).parse(read(option("--prices")!)):undefined;
  if(args.includes("--policy-only")) {
    const recorded = option("--recording") ? read(option("--recording")!) as { datasetDigest: string; runs: { name: string; repetition: number; rows: EvaluationRow[] }[] } : null;
    if (recorded && recorded.datasetDigest !== digest(cases)) throw new Error("Policy recording dataset mismatch");
    const results = recorded ? recorded.runs.flatMap(run => cases.map(c => {
      const row = run.rows.find(r => r.id === c.id);
      return { id: c.id, name: run.name, repetition: run.repetition, expected: c.expected,
        actual: row?.analysis ? classifySemanticAnalysis(validateSemanticAnalysis(row.analysis,{commentId:c.id,workspaceId:"evaluation",sourceText:c.sourceText,videoTitle:c.videoTitle,parent:c.parentText?{id:"parent",text:c.parentText}:null,allowedContexts:[],corrections:[]}),c.sourceText).level : null };
    })) : cases.filter(c=>c.review&&c.goldAnalysis&&c.expected).map(c=>({id:c.id,expected:c.expected,actual:classifySemanticAnalysis(c.goldAnalysis!,c.sourceText).level}));
    atomicSave(path,{schemaVersion:"semantic-policy-report-v1",results,releasePassed:false});
    if(!results.length||results.some(r=>r.expected && r.actual!==r.expected)) process.exitCode=1;
    return;
  }
  type Run={name:string;settings:z.infer<typeof SemanticSettingsSchema>;configurationKey:string;repetition:number;records:Record<string,Recording>;rows:EvaluationRow[];metrics:ReturnType<typeof evaluateSemanticRun>|null};
  type Report={schemaVersion:"semantic-evaluation-report-v1";datasetDigest:string;mode:string;runs:Run[];comparisons:{name:string;consistency:number|null;releasePassed:boolean}[];releasePassed:boolean};
  const baseline:Report|undefined=option("--replay")?read(option("--replay")!):undefined;
  const datasetDigest=digest(cases);
  if(baseline&&(baseline.schemaVersion!=="semantic-evaluation-report-v1"||baseline.datasetDigest!==datasetDigest)) throw new Error("Replay dataset mismatch");
  if(args.includes("--live")) loadEnvConfig(process.cwd(),true);
  const matrix=baseline?Array.from(new Map(baseline.runs.map(r=>[r.name,{name:r.name,settings:SemanticSettingsSchema.parse(r.settings)}])).values()):option("--matrix")?z.array(z.object({name:z.string().min(1),settings:SemanticSettingsSchema})).min(1).parse(read(option("--matrix")!)):[{name:args.includes("--fixture")?"test-fixture":"configured-live",settings:semanticSettingsFromEnv(args.includes("--fixture")?{EXTERNAL_PROVIDER_MODE:"fixture"}:{...process.env,EXTERNAL_PROVIDER_MODE:"live"})}];
  if(new Set(matrix.map(m=>m.name)).size!==matrix.length) throw new Error("Duplicate matrix name");
  if(!baseline&&matrix.some(m=>m.settings.provider!==(args.includes("--live")?"live":"fixture"))) throw new Error("Provider must match explicit mode");
  const report:Report={schemaVersion:"semantic-evaluation-report-v1",datasetDigest,mode:modes[0],runs:[],comparisons:[],releasePassed:false};
  for(const entry of matrix) {
    const providers=baseline?offlineProviders:providersFor(entry.settings);
    for(let repetition=1;repetition<=3;repetition++) {
      const run:Run={...entry,configurationKey:semanticConfigurationKey(entry.settings,1),repetition,records:{},rows:[],metrics:null}; report.runs.push(run);
      for(const c of cases) {
        const saved=baseline?.runs.find(r=>r.name===entry.name&&r.repetition===repetition)?.records[c.id];
        if(baseline&&!saved) throw new Error("Missing replay record");
        const record=await recordSemantic({commentId:c.id,workspaceId:"offline-evaluation",sourceText:c.sourceText,videoTitle:c.videoTitle,parent:c.parentText?{id:`${c.group}-parent`,text:c.parentText}:null,allowedContexts:[],corrections:[]},entry.settings,providers,saved,value=>{run.records[c.id]=value;atomicSave(path,report);});
        run.rows.push(evaluationRow(c.id,record,prices));
      }
      run.metrics=evaluateSemanticRun(cases,run.rows,alignments); atomicSave(path,report);
      console.log(`${entry.name} ${repetition}/3: accuracy=${run.metrics.threeLevelAccuracy}, eligible=${run.metrics.releaseEligible}, passed=${run.metrics.releasePassed}`);
    }
    const runs=report.runs.filter(r=>r.name===entry.name);
    report.comparisons.push({name:entry.name,consistency:repetitionConsistency(runs.map(r=>r.rows)),releasePassed:(args.includes("--live")||baseline?.mode==="--live")&&entry.settings.provider==="live"&&runs.every(r=>r.metrics?.releasePassed===true)});
  }
  report.releasePassed=report.comparisons.some(c=>c.releasePassed); atomicSave(path,report);
  // A development run is useful without being eligible for release.
  if(args.includes("--release")&&!report.releasePassed) process.exitCode=1;
  if(report.runs.some(r=>r.rows.some(row=>row.error))) process.exitCode=1;
}
main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
