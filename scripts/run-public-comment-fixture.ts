/** Same semantic pipeline as the worker. No database/YouTube writes. */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { PublicCommentFixtureSchema, fixtureHash } from "./public-comment-fixture";
import { semanticSettingsFromEnv, SemanticSettingsSchema } from "../src/features/classification/semantic-settings";
import { atomicSave, offlineProviders, providersFor, recordSemantic, type Recording } from "./semantic-recording";

async function main() {
  const [sourcePath,outputPath,mode,recordingPath]=process.argv.slice(2);
  if(!sourcePath||!outputPath||!["--live","--fixture","--replay"].includes(mode)) throw new Error("Usage: source.json output.json --live | --fixture | --replay recording.json");
  const output=resolve(outputPath); if(existsSync(output)) throw new Error("Output already exists");
  const read=(p:string)=>JSON.parse(readFileSync(resolve(p),"utf8"));
  const fixture=PublicCommentFixtureSchema.parse(read(sourcePath));
  const baseline=mode==="--replay"?read(recordingPath):null;
  if(baseline&&(baseline.schemaVersion!=="public-comment-semantic-v1"||baseline.fixtureSha256!==fixtureHash(fixture))) throw new Error("Requires a semantic recording of this exact fixture; legacy reports remain readable using the report tool");
  if(mode==="--live") loadEnvConfig(process.cwd(),true);
  const settings=baseline?SemanticSettingsSchema.parse(baseline.settings):semanticSettingsFromEnv(mode==="--fixture"?{EXTERNAL_PROVIDER_MODE:"fixture"}:{...process.env,EXTERNAL_PROVIDER_MODE:"live"});
  const providers=baseline?offlineProviders:providersFor(settings);
  const onlyIndex=process.argv.indexOf("--only");
  const ids:unknown=onlyIndex>=0?read(process.argv[onlyIndex+1]):null;
  if(ids!==null&&(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=="string"||!fixture.comments.some(c=>c.id===id)))) throw new Error("Invalid --only IDs");
  const comments=fixture.comments.filter(c=>!ids||(ids as string[]).includes(c.id));
  const run={schemaVersion:"public-comment-semantic-v1",fixtureSha256:fixtureHash(fixture),mode,settings,startedAt:new Date().toISOString(),finishedAt:null as string|null,records:{} as Record<string,Recording>};
  for(const c of comments) {
    const video=fixture.videos.find(v=>v.videoId===c.videoId)!;
    const parent=c.parentId?fixture.comments.find(p=>p.id===c.parentId):null;
    const saved=baseline?.records[c.id]; if(baseline&&!saved) throw new Error("Missing replay record");
    run.records[c.id]=await recordSemantic({commentId:c.id,workspaceId:"offline-public-fixture",sourceText:c.sourceText,videoTitle:video.title,parent:parent?{id:parent.id,text:parent.sourceText}:null,allowedContexts:[],corrections:[]},settings,providers,saved,record=>{run.records[c.id]=record;atomicSave(output,run);});
    console.log(`${Object.keys(run.records).length}/${comments.length} ${c.id}: ${run.records[c.id].error?"failed":run.records[c.id].result?.verdict.level}`);
  }
  run.finishedAt=new Date().toISOString();atomicSave(output,run);
  if(Object.values(run.records).some(r=>r.error)) process.exitCode=1;
}
main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
