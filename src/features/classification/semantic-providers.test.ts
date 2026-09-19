import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("openai",()=>({default:class {responses={parse:vi.fn()};}}));
import { createSemanticProviders } from "./semantic-providers";
import { semanticConfigurationKey, semanticSettingsFromEnv } from "./semantic-settings";
const live=semanticSettingsFromEnv({OPENAI_SEMANTIC_MODEL:"a",OPENAI_FEEDBACK_REWRITE_MODEL:"r",OPENAI_REWRITE_VALIDATION_MODEL:"v"});
afterEach(()=>vi.unstubAllEnvs());
describe("semantic activation",()=>{
 it("requires the exact approved production configuration",()=>{
  vi.stubEnv("NODE_ENV","production");vi.stubEnv("SEMANTIC_APPROVED_CONFIGURATION","");
  expect(()=>createSemanticProviders(live,"test",false)).toThrow("semantic_quality_approval_required");
  vi.stubEnv("SEMANTIC_APPROVED_CONFIGURATION",semanticConfigurationKey(live,1));
  expect(createSemanticProviders(live,"test",false)).toHaveProperty("analyzer");
  expect(()=>createSemanticProviders({...live,analysis:{model:"changed",effort:null}},"test",false)).toThrow("semantic_quality_approval_required");
 });
 it("never permits fixtures in production",()=>{
  vi.stubEnv("NODE_ENV","production");
  expect(()=>createSemanticProviders(semanticSettingsFromEnv({EXTERNAL_PROVIDER_MODE:"fixture"}),"test",true)).toThrow("fixture_disabled");
 });
 it("does not require release approval for explicit development comparisons",()=>{
  vi.stubEnv("NODE_ENV","development");vi.stubEnv("SEMANTIC_APPROVED_CONFIGURATION","");
  expect(createSemanticProviders(live,"test",false)).toHaveProperty("validator");
 });
});
