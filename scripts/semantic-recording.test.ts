import { describe, expect, it } from "vitest";
import { semanticSettingsFromEnv } from "../src/features/classification/semantic-settings";
import { createFixtureSemanticProviders } from "../src/features/classification/semantic-fixtures";
import { evaluationRow, offlineProviders, recordSemantic } from "./semantic-recording";
import { digest } from "../src/evaluation/semantic-evaluation";
const settings=semanticSettingsFromEnv({EXTERNAL_PROVIDER_MODE:"fixture"});
const context={commentId:"test",workspaceId:"fixture",sourceText:"자막이 작다. 찾아가서 때리겠다",videoTitle:"test",parent:null,allowedContexts:[],corrections:[]};
describe("semantic file recordings",()=>{
 it("replays the shared pipeline without network calls and binds human reviews to rewrite text",async()=>{
  const first=await recordSemantic(context,settings,createFixtureSemanticProviders());
  const replay=await recordSemantic(context,settings,offlineProviders,first);
  expect(replay.result).toEqual(first.result);expect(replay.state.attempts).toHaveLength(3);
  const row=evaluationRow("test",replay);expect(row.cost).toBeNull();
  expect(digest({...row,rewriteText:"changed"})).not.toBe(digest(row));
 });
 it("rejects context or configuration changes rather than reusing incompatible stages",async()=>{
  const first=await recordSemantic(context,settings,createFixtureSemanticProviders());
  await expect(recordSemantic({...context,videoTitle:"changed"},settings,offlineProviders,first)).rejects.toThrow("mismatch");
  await expect(recordSemantic(context,{...settings,analysis:{...settings.analysis,model:"other"}},offlineProviders,first)).rejects.toThrow("mismatch");
 });
});
