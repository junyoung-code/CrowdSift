/** node --import tsx scripts/report-public-comment-fixture.ts source.json results.json review.html [review-notes.json] */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { StoredClassificationState } from "../src/features/classification/classification-service";
import { fixtureHash, PublicCommentFixtureSchema } from "./public-comment-fixture";
import { explainClassification, LEVEL_NAMES } from "./public-comment-explanation";

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const [sourcePath, resultPath, outputPath, notesPath, previousPath] = process.argv.slice(2);
if (!sourcePath || !resultPath || !outputPath) throw new Error("Usage: report-public-comment-fixture.ts source.json results.json review.html");
const fixture = PublicCommentFixtureSchema.parse(JSON.parse(readFileSync(resolve(sourcePath), "utf8")));
const recordedText = readFileSync(resolve(resultPath), "utf8");
const semanticRun = JSON.parse(recordedText);
if (semanticRun.schemaVersion === "public-comment-semantic-v1") {
  if (semanticRun.fixtureSha256 !== fixtureHash(fixture)) throw new Error("Recording mismatch");
  const records = semanticRun.records as Record<string, import("./semantic-recording").Recording>;
  const cards = fixture.comments.flatMap(c => {
    const record = records[c.id]; if (!record) return [];
    const result = record.result;
    const analysis = result?.analysis;
    return [`<article><h2>${escape(c.id)} · ${escape(record.error ? "분석 실패" : result?.verdict.level)}</h2>
      <p>의미 복원: ${escape(analysis?.meaningClear)} → 대상: ${escape(analysis?.target)} → 피드백 ${analysis?.feedbackClaims.length ?? 0}개 → 공격 ${analysis?.harms.length ?? 0}개 → 잔존 ${result?.verdict.remainingFeedbackClaimIds.length ?? 0}개 → ${escape(result?.verdict.basis)}</p>
      <p>심각도: ${escape(result?.verdict.harmSeverity)} · criticalHarm: ${escape(result?.verdict.criticalHarm)} · 재작성: ${escape(result?.rewriteStatus)}</p>
      ${result?.rewriteStatus === "accepted" ? `<p>${escape(result.rewrite?.text)}</p>` : ""}
      <details><summary>원문·문맥·분석 근거 확인 (공격 표현 포함 가능)</summary><pre>${escape(JSON.stringify({source:c.sourceText,parent:c.parentId ? fixture.comments.find(p=>p.id===c.parentId)?.sourceText : null,analysis},null,2))}</pre></details></article>`];
  }).join("\n");
  writeFileSync(resolve(outputPath), `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>의미 분석 검토</title><style>body{font:16px/1.7 system-ui;max-width:1000px;margin:40px auto;padding:20px}article{padding:20px;border:1px solid #aaa;margin:20px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>의미 분석 기록</h1><p>${escape(semanticRun.mode)} · 모델 출력은 사람 검수 정답이 아닙니다.</p>${cards}</html>`,{mode:0o600});
  console.log(resolve(outputPath));
  process.exit(0);
}
const run = JSON.parse(recordedText) as {
  fixtureSha256: string; mode: string; finishedAt: string | null;
  rows: { id: string; status: string; errorCode: string | null; state: StoredClassificationState }[];
  prompts: unknown; models: unknown;
};
if (run.fixtureSha256 !== fixtureHash(fixture)) throw new Error("Recording does not match this fixture");
// Editorial review is separate from model output and tied to this exact recording.
const notes = notesPath && notesPath !== "-" ? JSON.parse(readFileSync(resolve(notesPath), "utf8")) as {
  recordingSha256: string;
  comments: Record<string, { title: string; explanation: string; assessment: string }>;
} : null;
if (notes && notes.recordingSha256 !== createHash("sha256").update(recordedText).digest("hex")) {
  throw new Error("Review notes belong to a different recording");
}
const rows = new Map(run.rows.map((row) => [row.id, row]));
const previous = previousPath ? JSON.parse(readFileSync(resolve(previousPath), "utf8")) as typeof run : null;
if (previous && previous.fixtureSha256 !== run.fixtureSha256) throw new Error("Comparison fixture mismatch");
const previousRows = new Map(previous?.rows.map((row) => [row.id, row]) ?? []);
const selectedCount = fixture.comments.filter((comment) => rows.has(comment.id)).length;
const comments = new Map(fixture.comments.map((comment) => [comment.id, comment]));
const videos = new Map(fixture.videos.map((video) => [video.videoId, video]));
const labels = LEVEL_NAMES;
const counts: Record<string, number> = {};
const cards = fixture.comments.map((comment, index) => {
  const row = rows.get(comment.id);
  if (!row) return "";
  const verdict = row?.state.verdict?.verdict;
  const level = row?.status !== "completed" ? row?.status ?? "pending" : verdict?.status === "review_queue" ? "review_queue" : verdict?.level ?? "failed";
  counts[level] = (counts[level] ?? 0) + 1;
  const video = videos.get(comment.videoId)!;
  const sourceUrl = `${video.canonicalUrl}&lc=${encodeURIComponent(comment.id)}`;
  const rewrite = row?.state.rewrite;
  const preview = rewrite?.inspection.accepted ? rewrite.result.rewritten : row?.state.verdict?.feedbackCore;
  const explanation = explainClassification(row?.state);
  const oldVerdict = previousRows.get(comment.id)?.state.verdict?.verdict;
  const oldLevel = oldVerdict?.status === "review_queue" ? "review_queue" : oldVerdict?.level;
  const note = notes?.comments[comment.id];
  const date = comment.publishedAt ? new Date(comment.publishedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "게시 시각 없음";
  return `<article id="comment-${index + 1}" data-level="${escape(level)}">
    <header><b>#${index + 1} · ${labels[level] ?? escape(level)}</b><span>${comment.parentId ? "답글" : "최상위"} · 좋아요 ${comment.likeCount}</span></header>
    ${oldLevel ? `<p><b>이전 ${labels[oldLevel]} → 이번 ${labels[level] ?? escape(level)}</b></p>` : ""}
    <p class="source">${escape(comment.sourceText)}</p>
    ${comment.parentId ? `<blockquote><b>답글의 부모 문맥</b><br>${escape(comments.get(comment.parentId)!.sourceText)}</blockquote>` : ""}
    <p class="video"><a href="${escape(video.canonicalUrl)}" target="_blank" rel="noopener noreferrer">${escape(video.title)}</a></p>
    <p class="metadata"><a href="${escape(sourceUrl)}" target="_blank" rel="noopener noreferrer">YouTube 댓글로 이동</a> · <time>${escape(date)} · 한국 시간</time></p>
    <section class="explanation" aria-label="분류 이유">
      <h2>이 판정이 나온 이유</h2>
      <p>${escape(explanation.summary)}</p>
      ${row.state.terra?.result.assessment?.excerpt || row.state.firstPass?.luna.result.assessment?.excerpt ? `<p><b>AI가 제시한 원문 근거</b><br>${escape(row.state.terra?.result.assessment?.excerpt ?? row.state.firstPass?.luna.result.assessment?.excerpt)}</p>` : ""}
      <ol class="steps">
        <li><h3>${escape(explanation.lunaTitle)} <span>Luna</span></h3><p>${escape(explanation.luna)}</p></li>
        <li><h3>${escape(explanation.terraTitle)} <span>Terra</span></h3><p>${escape(explanation.terra)}</p></li>
      </ol>
      <p class="routing">${escape(explanation.routing)}</p>
      <p class="moderation">${escape(explanation.moderation)}</p>
    </section>
    ${note ? `<aside class="review-note"><h3>검토 의견 · ${escape(note.title)}</h3><p>${escape(note.explanation)}</p><p>${escape(note.assessment)}</p><small>Codex가 원문·저장된 분류 신호·프롬프트를 대조한 해석입니다. 당시 AI가 직접 작성한 설명이나 확정 정답은 아닙니다.</small></aside>` : ""}
    ${preview ? `<p class="preview"><b>${rewrite?.inspection.accepted ? "AI가 만든 순화문" : "AI가 추출한 의견"}</b><br>${escape(preview)}</p>` : ""}
  </article>`;
}).join("\n");

const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>배블리 실제 댓글 분류 검토</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#101521;color:#e8edf7;font:16px/1.65 system-ui,sans-serif}main{max-width:1040px;margin:auto;padding:40px 20px}h1{font-size:30px;line-height:1.3;margin-bottom:12px}h2{font-size:18px;margin:0 0 8px}h3{font-size:16px;margin:0 0 8px}a{color:#a7c7ff}.note{color:#bbc7dc}.stats{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}.stat{padding:12px 18px;background:#202b40;border-radius:10px}nav{display:flex;flex-wrap:wrap;gap:8px;position:sticky;top:0;z-index:1;background:#101521;padding:14px 0}button{font:inherit;cursor:pointer;background:#24334e;color:#e8edf7;border:1px solid #5e7498;border-radius:8px;padding:7px 14px}button[aria-pressed=true]{background:#426bbc}button:focus-visible,a:focus-visible{outline:3px solid #ffdc80;outline-offset:3px}article{border:1px solid #40506b;border-radius:12px;padding:24px;margin:18px 0;background:#171f2e;scroll-margin-top:130px}article[hidden]{display:none}header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px}header b{font-size:21px}header span,.metadata{font-size:13px;color:#bbc7dc}.video{font-size:13px;overflow-wrap:anywhere;margin-bottom:4px}.metadata{margin-top:4px}.source{font-size:21px;line-height:1.7;margin:22px 0}.source,blockquote,.preview{white-space:pre-wrap;overflow-wrap:anywhere}blockquote{font-size:14px;color:#c4d1e8;border-left:3px solid #788bad;margin-left:0;padding-left:14px}article[data-level=danger]{border-color:#e18e95}article[data-level=review_queue]{border-color:#c5a4e8}article[data-level=caution]{border-color:#d9b365}.explanation{margin-top:22px;padding:20px;border-radius:10px;background:#202b40}.explanation>p{margin:8px 0 16px}.steps{display:grid;grid-template-columns:1fr 1fr;gap:20px;list-style:none;padding:0;margin:18px 0}.steps li{border-top:1px solid #51617b;padding-top:14px}.steps p{font-size:14px;color:#d3deed;margin:0}.steps h3 span{font-size:12px;color:#bbc7dc;font-weight:400}.routing,.moderation{font-size:13px;color:#bbc7dc}.explanation .moderation{margin-bottom:0}.review-note{margin-top:18px;border-left:3px solid #e0c078;padding:16px 18px;background:#2b2a26;border-radius:0 8px 8px 0}.review-note h3{color:#f1d28a}.review-note p{margin:8px 0;font-size:15px}.review-note small{color:#c4c1b8;font-size:12px}.preview{font-size:14px;padding:14px 18px;border-left:3px solid #788bad}@media(max-width:600px){main{padding:24px 12px}article{padding:18px}h1{font-size:25px}.source{font-size:19px}.steps{grid-template-columns:1fr;gap:12px}.explanation{padding:16px}nav{gap:6px}button{padding:6px 10px;font-size:14px}}
</style><main><p class="note">실제 공개 댓글 fixture · ${escape(run.mode)} 모델 기록 · 로컬 검토용</p><h1>배블리 댓글 ${selectedCount}개, 현재 로직의 판단</h1>
<p>전체 수집 자료: 최신 업로드 ${fixture.videos.length}개 · 최상위 ${fixture.videos.reduce((n, v) => n + v.topLevelCount, 0)}개 · 답글 ${fixture.videos.reduce((n, v) => n + v.replyCount, 0)}개</p>
<p class="note">원문 아래에서 AI의 해석과 최종 판정 이유를 비교할 수 있습니다. 새 실행은 AI가 작성한 짧은 설명과 원문 근거를 표시하며, 근거 기록이 없는 과거 실행은 분류 신호를 한국어로 풀어 표시합니다. 위험 판정은 확정 정답이 아닙니다.</p>
<p class="note">기본 공개 댓글 프로필과 영상 제목·부모 댓글로 분석한 1회 기록입니다. 실제 영상 내용은 모델에 제공하지 않았습니다.</p>
<p>이 페이지의 분석 대상: ${selectedCount}개${previous ? " · 이전 실행과 비교 · 번호는 원래 200개 목록 기준" : ""}</p>
<p class="note">수집: ${escape(fixture.capturedAt)} · 분석 완료: ${escape(run.finishedAt ?? "진행 중")}</p>
<div class="stats">${Object.entries(counts).map(([level, count]) => `<div class="stat">${labels[level] ?? escape(level)} <b>${count}</b></div>`).join("")}</div>
<nav aria-label="판정 필터"><button data-filter="all" aria-pressed="true">전체 ${selectedCount}</button>${Object.entries(counts).map(([level, count]) => `<button data-filter="${escape(level)}" aria-pressed="false">${labels[level] ?? escape(level)} ${count}</button>`).join("")}</nav>
<p id="count" aria-live="polite">${selectedCount}개 표시 중</p>${cards}
<p class="note">전체 원본 실행 기록은 같은 폴더의 ${escape(resultPath.split("/").pop())} 파일에 보존되어 있습니다.</p>
</main><script>document.querySelectorAll('button[data-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('button[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));let count=0;document.querySelectorAll('article').forEach(card=>{card.hidden=button.dataset.filter!=='all'&&card.dataset.level!==button.dataset.filter;if(!card.hidden)count++});document.getElementById('count').textContent=count+'개 표시 중'}));</script></html>`;
writeFileSync(resolve(outputPath), html, { mode: 0o600 });
console.log(resolve(outputPath));
