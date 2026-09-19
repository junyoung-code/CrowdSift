import { digest, type SemanticCase } from "../src/evaluation/semantic-evaluation";
import { activeHarms, remainingClaims, type SemanticAnalysis } from "../src/features/classification/semantic-contracts";
import { classifySemanticAnalysis } from "../src/features/classification/semantic-policy";
import type { SemanticSettings } from "../src/features/classification/semantic-settings";
import { evaluationRow, type Recording } from "./semantic-recording";
import { comparisonSummary, type ComparisonOptions, type ModelPrices, type ComparisonPresentation } from "./semantic-comparison-context";

export type ComparisonReport = {
  schemaVersion: "semantic-human-comparison-v1";
  datasetDigest: string;
  configurationKey?: string;
  baselineDigest?: string;
  originalDatasetDigest?: string;
  prices?: ModelPrices;
  presentation?: ComparisonPresentation;
  settings: SemanticSettings;
  startedAt: string;
  finishedAt: string | null;
  records: Record<string, Recording>;
};
const escape = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const labels: Record<string, string> = { safe: "안전", caution: "주의", risk: "위험", hold: "판단 보류", creator: "크리에이터", content: "콘텐츠", other_commenter: "다른 댓글 작성자", third_party: "제삼자", self: "댓글 작성자 자신", general: "일반적인 대상", unknown: "대상 불명", personal_attack: "인격 공격", mockery: "조롱", sexual_degradation: "성적 비하", appearance_attack: "외모 공격", threat: "위협", dehumanization: "비인간화", motive_speculation: "근거 없는 동기 추측", harassment: "괴롭힘", insult: "모욕", hate: "혐오", personal_info: "개인정보 노출", low: "낮음", medium: "중간", high: "높음", critical: "매우 높음", none: "없음", asserted: "직접 표현", endorsed: "동조", quoted: "인용", rejected: "반박" };
Object.assign(labels, { parent_author: "부모 댓글 작성자", viewers: "다른 시청자", other: "기타", fact: "사실 설명", question: "질문", suggestion: "제안", praise: "칭찬", defense: "옹호", complaint: "불만", comment: "댓글 본문", parent: "부모 댓글", title: "영상 제목" });
const label = (v: string) => labels[v] ?? v;
export function comparisonRows(cases: SemanticCase[], report: ComparisonReport) {
  if (digest(cases) !== report.datasetDigest) throw new Error("Comparison dataset mismatch");
  return cases.map(c => {
    const record = report.records[c.id];
    const done = Boolean(record?.result || record?.error);
    const row = done ? evaluationRow(c.id, record) : null;
    const status = !done ? "pending" : row?.error ? "error" : !c.expected ? "unrated" : c.expected === row?.level ? "match" : "mismatch";
    return { c, record, row, status };
  });
}
export function comparisonStats(cases: SemanticCase[], report: ComparisonReport) {
  const rows = comparisonRows(cases, report);
  const rated = rows.filter(r => r.c.expected);
  const finishedRated = rated.filter(r => r.status !== "pending");
  const matched = rated.filter(r => r.status === "match").length;
  return { total: rows.length, rated: rated.length, unrated: rows.length - rated.length,
    completed: rows.filter(r => r.status !== "pending").length, compared: finishedRated.length,
    matched, mismatched: rated.filter(r => r.status === "mismatch").length,
    errors: rows.filter(r => r.status === "error").length,
    awaitingReview: rows.filter(r => r.status === "unrated").length,
    pending: rows.filter(r => r.status === "pending").length,
    ratedErrors: rated.filter(r => r.status === "error").length,
    agreement: finishedRated.length ? matched / finishedRated.length : null };
}
function interpretationDetails(analysis: SemanticAnalysis) {
  const i = analysis.interpretation;
  if (!i) return "";
  const evidence = (items: Array<{ source: string; quote: string }>) => items.map(e => `${escape(label(e.source))}: ${escape(e.quote)}`).join(" · ");
  return `<h4>대화 상대</h4><ul>${i.addressees.map(a => `<li>${escape(label(a.target))}<blockquote>${a.evidence.length ? evidence(a.evidence) : "확인 가능한 근거 없음"}</blockquote></li>`).join("")}</ul>
    <h4>발화 의도</h4><ul>${i.speechActs.map(a => `<li>${escape(label(a.type))}<blockquote>${evidence(a.evidence)}</blockquote></li>`).join("")}</ul>
    <h4>명시된 뜻</h4><p>${escape(i.literalMeaning)}</p>
    <h4>확인되는 함의</h4>${i.impliedMeaning ? `<p>${escape(i.impliedMeaning.text)}</p><blockquote>${evidence(i.impliedMeaning.evidence)}</blockquote>` : "<p>확인되는 함의 없음</p>"}
    <h4>부족한 문맥</h4><p>${i.missingContext.length ? i.missingContext.map(escape).join(" / ") : "없음"}</p>`;
}
function holdExplanation(analysis: SemanticAnalysis, source: string) {
  const protectedText = [source, ...analysis.harms.flatMap(h => h.evidence)].filter(Boolean);
  const neutral = (text: string) => protectedText.some(raw => text.includes(raw)) ? "핵심 표현의 의미를 복원할 수 없습니다. 해당 표현의 뜻이나 지칭 대상을 확인해야 합니다." : text;
  return `<aside class="hold-reason"><b>보류 이유</b><p>${escape(neutral(analysis.uninterpretableReason ?? "핵심 의미를 복원할 수 없습니다."))}</p>${analysis.interpretation ? `<p>필요한 정보: ${analysis.interpretation.missingContext.map(neutral).map(escape).join(" / ")}</p>` : ""}</aside>`;
}
export function buildComparisonDocument(cases: SemanticCase[], report: ComparisonReport, options: ComparisonOptions = {}) {
  const presentation = options.presentation ?? report.presentation;
  const summary = comparisonSummary(cases, report, options);
  const pct = (value: number | null | undefined) => value == null ? "—" : `${(value * 100).toFixed(1)}%`;
  const usd = (value: number | null | undefined) => value == null ? "산출 불가" : `$${value.toFixed(4)}`;
  const baselineStats = summary.baselineOnRevisedLabels;
  const delta = baselineStats?.agreement != null && summary.current.agreement != null ? `${((summary.current.agreement - baselineStats.agreement) * 100).toFixed(1)}%p` : "—";
  const stats = comparisonStats(cases, report);
  const pendingReview = cases.filter(c => !c.expected && c.tags.includes("context_v2_pending_review")).length;
  const percent = stats.agreement === null ? "—" : `${(stats.agreement * 100).toFixed(1)}%`;
  const statusLabels: Record<string, string> = { pending: "분석 대기", match: "일치", mismatch: "불일치", error: "분석 실패", unrated: "평가 미확정" };
  const cards = comparisonRows(cases, report).map(({ c, record, row, status }, index) => {
    const number = presentation?.sourceNumbers[c.id] ?? index + 1;
    const previous = options.baseline?.records[c.id];
    const originalGrade = options.originalCases?.find(original => original.id === c.id)?.expected;
    const previousLevel = previous?.error ? "분석 실패" : previous?.result?.verdict.level ? label(previous.result.verdict.level) : "결과 없음";
    const a = row?.analysis;
    const verdict = a ? classifySemanticAnalysis(a, c.sourceText) : null;
    const harms = a ? activeHarms(a) : [];
    const remaining = a ? remainingClaims(a) : [];
    const policy = row?.level ? { safe: "크리에이터·콘텐츠 관련 공격이 없어 안전으로 분류했습니다.", caution: "관련 공격을 제거해도 전달할 피드백이 남아 주의로 분류했습니다.", risk: "관련 공격을 제거하면 전달할 피드백이 남지 않아 위험으로 분류했습니다.", hold: "제공된 문맥으로 댓글의 의미를 복원할 수 없어 판단을 보류했습니다." }[row.level] : "";
    const textDetails = a ? `${interpretationDetails(a)}<p class="meaning">${escape(a.coreMeaning)}</p><h4>추출한 피드백</h4>${a.feedbackClaims.length ? `<ul>${a.feedbackClaims.map(claim => `<li>${escape(claim.content)} <small>${remaining.some(r => r.id === claim.id) ? "공격 제거 후에도 남음" : "잔존 피드백에서 제외"}</small><blockquote>${claim.evidence.map(escape).join(" · ")}</blockquote></li>`).join("")}</ul>` : "<p>추출된 피드백 없음</p>"}<h4>공격 분석</h4>${a.harms.length ? `<ul>${a.harms.map(h => `<li><b>${escape(label(h.type))} · ${escape(label(h.target))}</b> · ${escape(label(h.expression))}<p>${escape(h.content)}</p><blockquote>${h.evidence.map(escape).join(" · ")}</blockquote></li>`).join("")}</ul>` : "<p>공격 요소 없음</p>"}${a.uninterpretableReason ? `<p>해석 불가 이유: ${escape(a.uninterpretableReason)}</p>` : ""}${a.uncertainties.length ? `<p>불확실한 부분: ${a.uncertainties.map(escape).join(" / ")}</p>` : ""}` : "";
    return `<article data-status="${status}" data-rated="${Boolean(c.expected)}" data-level="${row?.level ?? "pending"}" id="comment-${number}">
      <header><div><span class="number">${String(number).padStart(3, "0")}</span><strong class="level ${row?.level ?? "pending"}">${row?.level ? `AI ${label(row.level)}` : statusLabels[status]}</strong></div><div class="badges">${options.baseline ? `<span class="human">${escape(presentation?.baselineLabel ?? "이전 AI")} · ${escape(previousLevel)}</span>` : ""}<span class="human">내 평가 · ${c.expected ? label(c.expected) : c.tags.includes("context_v2_pending_review") ? "재검수 대기" : "미분류"}${originalGrade && originalGrade !== c.expected ? ` (기존 ${label(originalGrade)})` : ""}</span><span class="comparison ${status}">${statusLabels[status]}</span></div></header>
      <p class="video">${escape(c.videoTitle)}</p>
      ${a ? `<div class="steps">${a.interpretation ? `<section><span>대화 상대</span><b>${a.interpretation.addressees.map(x => escape(label(x.target))).join(" · ")}</b></section><section><span>발화 의도</span><b>${a.interpretation.speechActs.map(x => escape(label(x.type))).join(" · ")}</b></section>` : ""}<section><span>평가 대상</span><b>${escape(label(a.target))}</b></section><section><span>의미 이해</span><b>${a.meaningClear ? "해석 가능" : "의미 복원 불가"}</b></section><section><span>실제 공격 대상</span><b>${harms.length ? [...new Set(harms.map(h => label(h.target)))].map(escape).join(" · ") : "없음"}</b><small>${[...new Set(harms.map(h => label(h.type)))].map(escape).join(" · ")}</small></section><section><span>남는 피드백</span><b>${remaining.length}개</b></section></div>
      ${row?.level === "hold" ? holdExplanation(a, c.sourceText) : ""}
      <p class="signals">공격 심각도 ${escape(label(verdict!.harmSeverity))} · 심각한 공격 신호 ${verdict!.criticalHarm ? "있음" : "없음"}${verdict!.otherTargetHarm ? " · 타인 대상 공격 있음" : ""}${verdict!.spamSignals.length ? " · 스팸 신호 있음" : ""}</p>
      <details class="analysis" ${verdict!.hideSource ? "" : "open"}><summary>무슨 내용인지 · 피드백과 공격의 근거${verdict!.hideSource ? " (공격 표현 포함 가능)" : ""}</summary>${textDetails}</details>${policy ? `<p class="policy">${policy}</p>` : "<p class=\"policy\">의미 분석은 저장됐지만 후속 단계가 실패해 최종 비교 결과는 실패로 기록했습니다.</p>"}` : `<p class="muted">${status === "error" ? "API 또는 출력 검증 단계에서 실패했습니다. HOLD 판정으로 바꾸지 않습니다." : "아직 API 분석 결과가 없습니다."}</p>`}
      ${row?.rewriteStatus === "accepted" && row.rewriteText ? `<aside class="rewrite"><span>검증을 통과한 전달용 피드백</span><p>${escape(row.rewriteText)}</p></aside>` : row?.rewriteStatus === "failed" ? "<aside class=\"failed\">피드백 정리 실패 · 주의 판정 유지. 검증되지 않은 재작성은 표시하지 않습니다.</aside>" : ""}
      <details class="source"><summary>원문과 부모 댓글 확인 (공격 표현 포함 가능)</summary><p>${escape(c.sourceText)}</p>${c.parentText ? `<blockquote><b>부모 댓글</b><br>${escape(c.parentText)}</blockquote>` : ""}</details>
      <details class="technical"><summary>실행 기록</summary><p>댓글 ID ${escape(c.id)} · ${row ? `${(row.latencyMs / 1000).toFixed(1)}초 · 입력 ${row.inputTokens} / 출력 ${row.outputTokens} 토큰` : "대기 중"}</p>${a ? `<p>모델 자기보고 confidence: ${a.confidence} (검증된 확률 아님)</p>` : ""}${record?.error ? `<pre>${escape(record.error)}</pre>` : ""}</details></article>`;
  }).join("\n");
  const filters = [["all", "전체", stats.total], ["mismatch", "불일치", stats.mismatched], ["match", "일치", stats.matched], ["unrated", "평가 미확정", stats.awaitingReview], ["pending", "분석 대기", stats.pending], ["error", "분석 실패", stats.errors]];
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CrowdSift · AI 분석 비교</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f4f5f8;color:#18243b;font:16px/1.65 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:44px 28px 90px}h1{font-size:34px;letter-spacing:-1px;margin:8px 0 10px}.eyebrow{font-size:12px;letter-spacing:2px;font-weight:750;color:#526591}.muted,.video,.signals,.technical{color:#5d687b;font-size:13px}.intro{max-width:760px;color:#5d687b}.hero{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:28px 0 12px}.metric{background:white;border:1px solid #dce1ea;border-radius:16px;padding:22px}.metric:first-child{background:#1b3157;color:white}.metric span{display:block;font-size:13px}.metric strong{display:block;font-size:36px;line-height:1.3;margin:8px 0}.metric:first-child strong{font-size:48px}.metric small{opacity:.8}nav{display:flex;gap:8px;flex-wrap:wrap;position:sticky;top:0;background:#f4f5f8ed;backdrop-filter:blur(8px);padding:18px 0;z-index:1}button,select{font:inherit}button{border:1px solid #c5cfdf;background:white;border-radius:24px;padding:8px 16px;cursor:pointer;color:#324762}button[aria-pressed=true]{background:#20395e;color:white;border-color:#20395e}button:focus-visible,summary:focus-visible,select:focus-visible{outline:3px solid #587feb;outline-offset:3px}.filter-label{display:flex;align-items:center;gap:8px;font-size:13px;margin-left:auto}select{padding:8px;border:1px solid #c5cfdf;border-radius:8px;background:white}article{background:white;border:1px solid #dce1ea;border-radius:16px;padding:26px;margin:18px 0;scroll-margin-top:100px}article[data-status=mismatch]{border-left:4px solid #cb8236}article[hidden]{display:none}header,header>div,.badges{display:flex;align-items:center;gap:12px}.badges{flex-wrap:wrap}.hold-reason{background:#eeeaf7;border-radius:8px;padding:14px;margin:14px 0}header{justify-content:space-between;flex-wrap:wrap}.number{color:#8b95a7;font-size:13px;font-variant-numeric:tabular-nums}.level{font-size:22px}.safe{color:#20765c}.caution{color:#94630b}.risk{color:#af3649}.hold{color:#70519a}.human{font-size:12px;color:#607087;background:#f2f4f8;border:1px solid #e4e8f0;border-radius:6px;padding:3px 8px}.comparison{font-size:12px;font-weight:650}.match{color:#357d64}.mismatch,.error{color:#ad531e}.video{margin:12px 0 20px;overflow-wrap:anywhere}.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;border-top:1px solid #e7eaf0;border-bottom:1px solid #e7eaf0;padding:18px 0}.steps span{display:block;font-size:12px;color:#65728a;margin-bottom:6px}.steps b{font-size:15px}.policy{font-weight:600;margin:20px 0 6px}.signals{margin:0 0 20px}.analysis{background:#f7f8fb;border-radius:10px;padding:15px 18px}.analysis summary{font-weight:600;font-size:14px}summary{cursor:pointer}.meaning{font-size:18px;line-height:1.8}h4{font-size:14px;margin:22px 0 8px}ul{padding-left:22px}li{margin:10px 0}li small{color:#5b6b84;display:block}blockquote{border-left:3px solid #c6cede;margin:10px 0;padding:6px 15px;color:#657086;font-size:14px}p,blockquote,pre{white-space:pre-wrap;overflow-wrap:anywhere}.rewrite{background:#edf6f1;border-left:3px solid #509274;border-radius:8px;padding:18px 20px;margin:18px 0}.rewrite span{font-size:12px;color:#397759;font-weight:700}.rewrite p{margin:8px 0 0;font-size:17px}.source,.technical{margin-top:18px;font-size:13px}.source>p{font-size:17px}.technical pre{font-size:12px}.failed{padding:14px;background:#fff5e8;margin:14px 0}.method{padding:18px 0;font-size:13px;color:#5d687b}a{color:#355c99}@media(max-width:700px){main{padding:24px 14px 60px}h1{font-size:27px}.hero{grid-template-columns:1fr 1fr;gap:9px}.metric{padding:16px}.metric strong{font-size:28px}.metric:first-child strong{font-size:36px}article{padding:20px 16px}.steps{grid-template-columns:1fr 1fr;gap:16px}.filter-label{margin-left:0}.badges{gap:7px}.level{font-size:20px}nav{position:static}}
  </style></head><body><main><div class="eyebrow">CROWDSIFT / SEMANTIC REVIEW</div><h1>${escape(presentation?.title ?? "AI의 해석, 내 판단과 나란히")}</h1><p class="intro">누구에게 말하는지, 어떤 피드백과 공격이 있는지 분석한 뒤 정해진 정책으로 등급을 결정합니다. 직접 선택한 등급은 각 댓글 오른쪽에 작게 표시했습니다.</p>
  ${presentation ? `<p class="intro">${escape(presentation.note)}</p>` : ""}<div class="hero"><section class="metric"><span>${stats.completed < stats.total ? "진행 중 · 현재까지의 일치율" : "내 평가와의 일치율"}</span><strong>${percent}</strong><small>${stats.matched} / ${stats.compared}건 일치</small></section><section class="metric"><span>일치</span><strong>${stats.matched}</strong><small>같은 등급</small></section><section class="metric"><span>불일치</span><strong>${stats.mismatched}</strong><small>다른 등급</small></section><section class="metric"><span>평가 미확정</span><strong>${stats.awaitingReview}</strong><small>분석 완료 · 등급 비교 제외</small></section><section class="metric"><span>분석 실패</span><strong>${stats.errors}</strong><small>실패는 별도 집계</small></section><section class="metric"><span>전체</span><strong>${stats.total}</strong><small>분석 완료 ${stats.completed} · 대기 ${stats.pending}</small></section></div>
  <p class="muted">일치 ${stats.matched} + 불일치 ${stats.mismatched} + 평가 미확정 ${stats.awaitingReview} + 분석 실패 ${stats.errors}${stats.pending ? ` + 분석 대기 ${stats.pending}` : ""} = 전체 ${stats.total}</p>
  <p class="muted">내 등급 ${stats.rated}건 · ${pendingReview ? `재검수 대기 ${pendingReview}건 + 기존 미분류 ${stats.unrated - pendingReview}건` : `미분류 ${stats.unrated}건`}은 일치율에서 제외 · 평가된 댓글의 분석 실패 ${stats.ratedErrors}건은 분모에 포함합니다.${stats.completed < stats.total ? " 아직 분석하지 않은 댓글은 현재 수치에서 제외합니다." : ""}</p>
  <p class="muted">${report.settings.analysis.model === "unconfigured" ? "API 실행 대기 · 모델 미선택" : report.settings.provider === "live" ? "실제 API" : "TEST FIXTURE · 실제 성능 수치 아님"} · 의미 분석 ${escape(report.settings.analysis.model)} · 재작성 ${escape(report.settings.rewrite.model)} · 검증 ${escape(report.settings.validation.model)} · ${escape(report.settings.interpretationProfile ?? "context-v1")} · 이번 비교 1회</p>
  <section class="analysis" aria-label="비용과 전후 비교"><b>실측 토큰 기준 추정 비용 ${usd(summary.usage.estimatedUSD)}</b><p class="muted">입력 ${summary.usage.inputTokens.toLocaleString()} / 출력 ${summary.usage.outputTokens.toLocaleString()} 토큰 · 기록된 호출 ${summary.usage.calls}회 · 재작성 통과 ${summary.usage.rewriteAccepted}건 / 실패 ${summary.usage.rewriteFailed}건<br>중앙 처리 시간 ${summary.usage.medianLatencyMs == null ? "—" : (summary.usage.medianLatencyMs / 1000).toFixed(1)}초 · P95 ${summary.usage.p95LatencyMs == null ? "—" : (summary.usage.p95LatencyMs / 1000).toFixed(1)}초<br>단가 × 토큰, 캐시 할인 전 추정치이며 청구액이 아닙니다. 사용량 누락 ${summary.usage.incompleteUsage}건. 전송 단계 자동 재시도로 집계되지 않은 비용이 있을 수 있습니다.</p>${baselineStats ? `<p>동일한 수정 후 평가 기준: 이전 ${pct(baselineStats.agreement)} → 이번 ${percent} (${report.finishedAt ? delta : "진행 중 · 증감 미확정"})<br>원래 평가 기준: 이전 ${pct(summary.baselineOnOriginalLabels?.agreement)} → 이번 ${pct(summary.currentOnOriginalLabels?.agreement)}<br>이전 비용 ${usd(summary.baselineUsage?.estimatedUSD)} · 이전 분석 실패 ${baselineStats.errors}건 → 이번 ${stats.errors}건</p>` : ""}</section>
  <nav aria-label="비교 필터">${filters.map(([key, text, count]) => `<button data-filter="${key}" aria-pressed="${key === "all"}">${text} ${count}</button>`).join("")}<label class="filter-label">AI 등급 <select id="level"><option value="all">전체 등급</option value="safe">안전</option><option value="caution">주의</option><option value="risk">위험</option><option value="hold">판단 보류</option></select></label></nav><p id="visible-count" class="muted" aria-live="polite">${stats.total}개 표시 중</p>${cards}
  <footer class="method">개발용 댓글과 개인 검수 등급의 비교입니다. 정식 출시 정확도나 사람 검수 중간 분석 정답을 의미하지 않습니다. API에는 내 등급을 보내지 않습니다. 원문·영상 제목·부모 댓글과 선택한 해석 지침을 제공합니다. 튜닝에 참고한 사례를 포함하므로 독립 평가가 아닙니다. 공격 심각도는 분류 등급과 별개입니다.</footer></main>
  <script>let filter='all';const buttons=document.querySelectorAll('button[data-filter]');const level=document.getElementById('level');function apply(){let count=0;document.querySelectorAll('article').forEach(card=>{card.hidden=(filter!=='all'&&card.dataset.status!==filter)||(level.value!=='all'&&card.dataset.level!==level.value);if(!card.hidden)count++});document.getElementById('visible-count').textContent=count+'개 표시 중'}buttons.forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;buttons.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));apply()}));level.addEventListener('change',apply);</script></body></html>`;
}
