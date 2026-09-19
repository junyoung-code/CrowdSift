import { describe, expect, it } from "vitest";
import { fixtureSemanticAnalysis } from "../features/classification/semantic-fixtures";
import { evaluateSemanticRun, semanticMetrics, validateDataset, type SemanticCase, type EvaluationRow } from "./semantic-evaluation";
const c: SemanticCase = {id:"one",group:"thread",split:"holdout",sourceText:"자막이 작다",videoTitle:"video",parentText:null,expected:"safe",review:null,tags:["clear_normal"],goldAnalysis:null};
const row: EvaluationRow = {id:"one",level:"safe",analysis:null,error:null,latencyMs:10,inputTokens:1,outputTokens:2,cost:null,rewriteStatus:"not_required",rewriteText:null};
describe("semantic evaluation",()=>{
  it("counts failures and wrong HOLD in the denominator",()=>{
    for(const change of [{level:null,error:"api_failed"},{level:"hold" as const,error:null}]) {
      const result=evaluateSemanticRun([c],[{...row,...change}]);
      expect(result.threeLevelAccuracy).toBe(0); expect(result.perLevel.safe.recall).toBe(0);
    }
  });
  it("never approves unreviewed data even at perfect accuracy",()=>{
    expect(evaluateSemanticRun([c],[row])).toMatchObject({accuracy:1,releaseEligible:false,releasePassed:false});
  });
  it("detects group, duplicate and near-variant split leakage",()=>{
    for(const change of [{group:c.group,sourceText:"다른 댓글"},{group:"other",sourceText:c.sourceText+"!!"},{group:"other",sourceText:"자막이 작다"}]) expect(()=>validateDataset([c,{...c,...change,id:"two",split:"development"}])).toThrow("split_leakage");
  });
  it("does not compare claim ID strings or mark paraphrases wrong without review",()=>{
    const gold=fixtureSemanticAnalysis(c.sourceText); const actual=structuredClone(gold);
    actual.feedbackClaims[0].id="different-id";actual.remainingFeedbackClaimIds=["different-id"];
    expect(semanticMetrics(gold,actual)).toMatchObject({remainingClaimsCorrect:true,missingClaims:0});
    actual.feedbackClaims[0].content="글씨가 작다는 불편";
    expect(semanticMetrics(gold,actual)).toMatchObject({needsHumanAlignment:true,missingClaims:null});
    expect(semanticMetrics(gold,actual,{rowDigest:"x",reviewer:"reviewer",claims:[{goldId:gold.feedbackClaims[0].id,actualId:"different-id"}],rewrite:null})).toMatchObject({needsHumanAlignment:false,remainingClaimsCorrect:true});
  });
  it("evaluates reviewed analysis and policy independently",()=>{
    const gold=fixtureSemanticAnalysis(c.sourceText);
    const result=evaluateSemanticRun([{...c,review:{reviewer:"human",reviewedAt:new Date().toISOString(),reason:"reviewed"},goldAnalysis:gold}],[{...row,analysis:{...gold,target:"creator"}}]);
    expect(result.policy[0].passed).toBe(true);expect(result.analysis.targetAccuracy).toBe(0);
  });
});
