/** Export source/context only. Existing model grades never become human gold. */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import type { SemanticCase } from "../src/evaluation/semantic-evaluation";
export const escapeInlineJson = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c");
export const buildReviewDocument = (cases: SemanticCase[]) => `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>의미 분석 사람 검수</title>
<style>body{font:16px/1.6 system-ui;max-width:1000px;margin:32px auto;padding:20px}article{border:1px solid #aaa;padding:20px;margin:16px 0}label{display:block;margin:12px 0}textarea{width:100%;min-height:90px}button,select,input,textarea{font:inherit}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>
<h1>실제 댓글 분류 검수</h1><p>부정적 의견 자체는 harm이 아닙니다. 관련 공격 없음 SAFE / 공격 제거 후 피드백 남음 CAUTION / 남지 않음 RISK / 의미 복원 불가 HOLD. 심각도는 등급과 별개입니다.</p>
<label>검수자 <input id="reviewer"></label><button id="download">검수 JSON 저장</button><p id="status" role="status"></p><main id="cases"></main>
<script>
const cases=${escapeInlineJson(cases)};
for(const item of cases){
 const article=document.createElement('article');const title=document.createElement('h2');title.textContent=item.id+' · '+item.videoTitle;article.append(title);
 const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='원문과 부모 문맥 보기 (공격 표현 포함 가능)';const source=document.createElement('pre');source.textContent=item.sourceText+(item.parentText?'\\n부모: '+item.parentText:'');details.append(summary,source);article.append(details);
 const field=(label,element)=>{const l=document.createElement('label');l.textContent=label;l.append(element);article.append(l);return element;};
 const select=field('등급',document.createElement('select'));for(const value of ['', 'safe','caution','risk','hold']){const o=document.createElement('option');o.value=value;o.textContent=value||'미검수';select.append(o);}select.value=item.expected||'';select.onchange=()=>{item.expected=select.value||null;};
 const split=field('데이터 용도',document.createElement('select'));for(const value of ['holdout','development']){const o=document.createElement('option');o.value=value;o.textContent=value;split.append(o);}split.value=item.split;split.onchange=()=>item.split=split.value;
 const group=field('같은 대화·유사 변형 그룹',document.createElement('input'));group.value=item.group;group.oninput=()=>item.group=group.value.trim();
 const reason=field('판단 이유 (필수)',document.createElement('textarea'));reason.value=item.review?.reason||'';item.draftReason=reason.value;reason.oninput=()=>item.draftReason=reason.value.trim();
 const tags=field('회귀 태그 (쉼표 구분: clear_normal, pure_creator_attack 등)',document.createElement('input'));tags.value=item.tags.join(', ');tags.oninput=()=>item.tags=tags.value.split(',').map(t=>t.trim()).filter(Boolean);
 const gold=field('중간 분석 정답 JSON (선택: meaningClear, target, feedbackClaims, harms, remainingFeedbackClaimIds 등을 계약에 맞게 작성)',document.createElement('textarea'));gold.value=item.goldAnalysis?JSON.stringify(item.goldAnalysis,null,2):'';item.draftGold=gold.value;gold.oninput=()=>item.draftGold=gold.value;
 document.querySelector('#cases').append(article);
}
document.querySelector('#download').onclick=()=>{try{
 const reviewer=document.querySelector('#reviewer').value.trim();if(!reviewer)throw Error('검수자를 입력해 주세요.');
 const output=cases.map(({draftGold,draftReason,...item})=>({...item,goldAnalysis:draftGold.trim()?JSON.parse(draftGold):null,review:item.expected&&draftReason?{reviewer,reason:draftReason,reviewedAt:new Date().toISOString()}:null}));
 const blob=new Blob([JSON.stringify({schemaVersion:'semantic-evaluation-v1',cases:output},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='semantic-reviewed.json';a.click();URL.revokeObjectURL(a.href);document.querySelector('#status').textContent='검수 JSON 저장 완료. 실행기가 근거와 데이터 분리를 검증합니다.';
}catch(e){document.querySelector('#status').textContent=e.message;}};
</script></html>`;
async function main(){
 loadEnvConfig(process.cwd(),true);
 const workspaceId=process.argv[2];if(!workspaceId)throw new Error('Usage: export-classification-evaluation.ts WORKSPACE_ID [output-directory]');
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:rows,error}=await db.from('raw_comments').select('id,youtube_video_id,youtube_comment_id,parent_youtube_comment_id,text_display,first_import_job_id').eq('workspace_id',workspaceId).order('captured_at',{ascending:false}).limit(1000);if(error)throw error;
 const [{data:jobs,error:jobError},{data:videos,error:videoError}]=await Promise.all([
 db.from('comment_import_jobs').select('id,provider_mode').eq('workspace_id',workspaceId).in('id',[...new Set((rows??[]).map(r=>r.first_import_job_id))]),
 db.from('youtube_videos').select('youtube_video_id,title').eq('workspace_id',workspaceId),]);if(jobError||videoError)throw jobError??videoError;
 const selected=(rows??[]).filter(r=>jobs?.some(j=>j.id===r.first_import_job_id&&j.provider_mode==='live'));
 const parentIds=[...new Set(selected.flatMap(r=>r.parent_youtube_comment_id?[r.parent_youtube_comment_id]:[]))];
 const {data:parents,error:parentError}=parentIds.length?await db.from('raw_comments').select('youtube_comment_id,text_display').eq('workspace_id',workspaceId).in('youtube_comment_id',parentIds):{data:[],error:null};if(parentError)throw parentError;
 const cases:SemanticCase[]=selected.map(r=>{
  const parent=r.parent_youtube_comment_id?parents?.find(p=>p.youtube_comment_id===r.parent_youtube_comment_id):null;
  if(r.parent_youtube_comment_id&&!parent)throw new Error(`Missing parent context: ${r.id}`);
  return {id:r.id,group:`${r.youtube_video_id}:${r.parent_youtube_comment_id??r.youtube_comment_id}`,split:'holdout',sourceText:r.text_display,videoTitle:videos?.find(v=>v.youtube_video_id===r.youtube_video_id)?.title??'',parentText:parent?.text_display??null,expected:null,review:null,tags:[],goldAnalysis:null};});
 if(!cases.length)throw new Error('No live comments in this workspace');
 const dir=resolve(process.argv[3]??'measurements/semantic-review');mkdirSync(dir,{recursive:true});
 writeFileSync(resolve(dir,'draft.json'),JSON.stringify({schemaVersion:'semantic-evaluation-v1',cases},null,2),{mode:0o600,flag:'wx'});
 writeFileSync(resolve(dir,'review.html'),buildReviewDocument(cases),{mode:0o600,flag:'wx'});console.log(`${cases.length} unreviewed cases: ${dir}`);
}
if(process.argv[1]?.endsWith('export-classification-evaluation.ts'))main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
