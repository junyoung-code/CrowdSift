/**
 * 측정 결과 JSON 을 훑어보기 좋은 한 장으로 만든다.
 *
 * 기준이 마음에 드는지 사람이 눈으로 판단하는 화면이다. 그래서 등급별로 묶고
 * 댓글 원문을 가장 크게 둔다. 판단 대상이 그것이기 때문이다.
 *
 *   npx tsx scripts/review-page.ts                     가장 최근 측정
 *   npx tsx scripts/review-page.ts measurements/x.json 특정 측정
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Row = {
  id: string;
  text: string;
  expected: string;
  video: string;
  candidate: "safe" | "caution" | "danger";
  lunaCertainty: string;
  verified: boolean;
  terraLevel: "safe" | "caution" | "danger" | null;
  terraCertainty: string | null;
  terra: {
    reasonCodes: string[];
    feedbackCore: string | null;
    feedbackActionable: boolean;
    safetyCase: boolean;
  } | null;
  verdict: {
    status: "decided" | "review_queue";
    level: "safe" | "caution" | "danger" | null;
    basis: string;
    allowRewrite: boolean;
    agreedWithFirstPass: boolean;
  } | null;
};

type Measurement = {
  ranAt: string;
  models: { luna: string; terra: string; moderation: string };
  prompts: { luna: string; terra: string };
  tokens: { luna: number; terra: number };
  rows: Row[];
};

const latestMeasurement = (): string => {
  const directory = resolve(process.cwd(), "measurements");
  const files = readdirSync(directory)
    .filter((name) => name.startsWith("pipeline-") && name.endsWith(".json"))
    .sort();
  const last = files.at(-1);

  if (!last) throw new Error("measurements 폴더에 측정 결과가 없습니다");

  return resolve(directory, last);
};

/** 최종 상태. 즉시 안전은 Terra 를 부르지 않은 것이라 따로 센다. */
type Bucket = "danger" | "queue" | "caution" | "safe" | "instant";

const bucketOf = (row: Row): Bucket => {
  if (!row.verdict) return "instant";
  if (row.verdict.status === "review_queue") return "queue";
  return row.verdict.level!;
};

const BUCKETS: Array<{
  key: Bucket;
  title: string;
  blurb: string;
}> = [
  {
    key: "danger",
    title: "위험",
    blurb: "원문을 노출하지 않는다. 순화문도 만들지 않는다. 증거를 보관한다.",
  },
  {
    key: "queue",
    title: "검토 대기",
    blurb:
      "등급을 정하지 못했다. 등급 칸이 비어 있고 사람이 직접 본다. 원문은 숨긴 채로 둔다.",
  },
  {
    key: "caution",
    title: "주의",
    blurb:
      "원문은 숨기고, 순화할 재료가 있으면 순화문으로 전달한다. 없으면 통계로만 남는다.",
  },
  {
    key: "safe",
    title: "안전",
    blurb: "검증을 거쳐 안전으로 확정했다. 원문이 그대로 노출된다.",
  },
  {
    key: "instant",
    title: "즉시 안전",
    blurb:
      "1차에서 조건을 모두 만족해 Terra 를 부르지 않았다. 원문이 그대로 노출된다.",
  },
];

const LEVEL_WORD: Record<string, string> = {
  safe: "안전",
  caution: "주의",
  danger: "위험",
};

const BASIS_WORD: Record<string, string> = {
  both_agreed: "두 판단 일치",
  non_negotiable_risk_confirmed: "완화 불가 신호 확인",
  verifier_uncertain: "Terra 판단 불가",
  verifier_decided_boundary: "경계에서 Terra 가 정함",
  danger_in_either: "한쪽이 위험이라 높은 쪽",
  protective_on_boundary: "경계에서 보호 쪽",
};

/** 계획서가 적어둔 기대 등급. 정답이 아니라 참고용이다. */
const expectedWord = (expected: string) =>
  expected.includes("위험")
    ? "위험"
    : expected.includes("주의")
      ? "주의"
      : expected.includes("안전")
        ? "안전"
        : "미확정";

const finalWord = (row: Row) => {
  const bucket = bucketOf(row);
  if (bucket === "queue") return "검토 대기";
  if (bucket === "instant") return "안전";
  return LEVEL_WORD[bucket]!;
};

/** 계획서 기대와 갈렸는가. 미확정은 애초에 정답을 두지 않은 것이라 제외한다. */
const differs = (row: Row) => {
  const expected = expectedWord(row.expected);
  return expected !== "미확정" && expected !== finalWord(row);
};

const escape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const pathChip = (row: Row) => {
  if (!row.verified) {
    return `<span class="path"><span class="hop">${LEVEL_WORD[row.candidate]}</span><span class="arrow">즉시 확정</span></span>`;
  }

  const moved = row.candidate !== row.terraLevel;

  return `<span class="path">
    <span class="hop">Luna ${LEVEL_WORD[row.candidate]}</span>
    <span class="arrow${moved ? " moved" : ""}">→</span>
    <span class="hop">Terra ${LEVEL_WORD[row.terraLevel!]}</span>
  </span>`;
};

const rowMarkup = (row: Row) => {
  const bucket = bucketOf(row);
  const off = differs(row);
  const notes: string[] = [];

  if (row.verdict?.allowRewrite) notes.push("순화 생성");
  if (row.terra?.safetyCase) notes.push("작성자 위기 신호");
  if (row.terraCertainty && row.terraCertainty !== "clear") {
    notes.push(`Terra ${row.terraCertainty}`);
  }
  if (!row.verified && row.lunaCertainty !== "clear") {
    notes.push(`Luna ${row.lunaCertainty}`);
  }

  return `<article class="row lv-${bucket}${off ? " off" : ""}" data-off="${off}">
  <div class="stripe" aria-hidden="true"></div>
  <div class="body">
    <p class="text">${escape(row.text)}</p>
    <div class="meta">
      <span class="id">${row.id}</span>
      ${pathChip(row)}
      ${row.verdict ? `<span class="basis">${BASIS_WORD[row.verdict.basis] ?? row.verdict.basis}</span>` : ""}
      ${notes.map((note) => `<span class="note">${escape(note)}</span>`).join("")}
    </div>
  </div>
  <div class="expectation">
    ${
      off
        ? `<span class="expected-off">계획서 <strong>${expectedWord(row.expected)}</strong></span>`
        : `<span class="expected-ok">${expectedWord(row.expected)}</span>`
    }
  </div>
</article>`;
};

const main = () => {
  const source = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : latestMeasurement();
  const measurement = JSON.parse(readFileSync(source, "utf8")) as Measurement;
  const rows = measurement.rows;

  const counts = new Map<Bucket, Row[]>();
  for (const bucket of BUCKETS) counts.set(bucket.key, []);
  for (const row of rows) counts.get(bucketOf(row))!.push(row);

  const offCount = rows.filter(differs).length;
  const ranAt = new Date(measurement.ranAt).toLocaleString("ko-KR", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const distribution = BUCKETS.map((bucket) => {
    const count = counts.get(bucket.key)!.length;
    return `<div class="seg lv-${bucket.key}" style="flex-grow:${count}" title="${bucket.title} ${count}건"></div>`;
  }).join("");

  const legend = BUCKETS.map((bucket) => {
    const count = counts.get(bucket.key)!.length;
    return `<div class="tally lv-${bucket.key}">
      <span class="swatch" aria-hidden="true"></span>
      <span class="tally-name">${bucket.title}</span>
      <span class="tally-count">${count}</span>
    </div>`;
  }).join("");

  const sections = BUCKETS.map((bucket) => {
    const group = counts.get(bucket.key)!;
    if (group.length === 0) return "";

    return `<section class="group" id="lv-${bucket.key}">
  <header class="group-head lv-${bucket.key}">
    <h2>${bucket.title}<span class="group-count">${group.length}</span></h2>
    <p>${bucket.blurb}</p>
  </header>
  <div class="rows">
    ${group.map(rowMarkup).join("\n")}
  </div>
</section>`;
  }).join("\n");

  const html = `<title>댓글 분류 기준 훑어보기</title>
<style>
  :root {
    color-scheme: light dark;
    --ground: #f4f5f8;
    --surface: #ffffff;
    --ink: #171a22;
    --muted: #656b7a;
    --faint: #8b91a0;
    --rule: #e2e4ec;
    --accent: #2f3d78;
    --safe: #2b7350;
    --caution: #92660f;
    --danger: #a4352e;
    --queue: #5b6070;
    --instant: #6f7686;
    --off: #a4352e;

    --sans: "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic",
      "Noto Sans KR", system-ui, sans-serif;
    --mono: ui-monospace, "Cascadia Mono", "SF Mono", Consolas, "D2Coding",
      monospace;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --ground: #101219;
      --surface: #181b23;
      --ink: #e7e9f0;
      --muted: #98a0b1;
      --faint: #6d7484;
      --rule: #262a35;
      --accent: #94a3e8;
      --safe: #57ab7f;
      --caution: #cfa03f;
      --danger: #e0736a;
      --queue: #9aa1b3;
      --instant: #848b9c;
      --off: #e0736a;
    }
  }

  :root[data-theme="dark"] {
    --ground: #101219;
    --surface: #181b23;
    --ink: #e7e9f0;
    --muted: #98a0b1;
    --faint: #6d7484;
    --rule: #262a35;
    --accent: #94a3e8;
    --safe: #57ab7f;
    --caution: #cfa03f;
    --danger: #e0736a;
    --queue: #9aa1b3;
    --instant: #848b9c;
    --off: #e0736a;
  }

  :root[data-theme="light"] {
    --ground: #f4f5f8;
    --surface: #ffffff;
    --ink: #171a22;
    --muted: #656b7a;
    --faint: #8b91a0;
    --rule: #e2e4ec;
    --accent: #2f3d78;
    --safe: #2b7350;
    --caution: #92660f;
    --danger: #a4352e;
    --queue: #5b6070;
    --instant: #6f7686;
    --off: #a4352e;
  }

  .lv-safe { --lv: var(--safe); }
  .lv-caution { --lv: var(--caution); }
  .lv-danger { --lv: var(--danger); }
  .lv-queue { --lv: var(--queue); }
  .lv-instant { --lv: var(--instant); }

  body {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font-family: var(--sans);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  .page {
    max-width: 60rem;
    margin: 0 auto;
    padding: 3rem 1.25rem 6rem;
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

  .eyebrow {
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
    margin: 0 0 0.75rem;
  }

  h1 {
    font-size: clamp(1.7rem, 4vw, 2.3rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.2;
    text-wrap: balance;
    margin: 0 0 0.75rem;
  }

  .lede {
    color: var(--muted);
    max-width: 44rem;
    margin: 0;
  }

  .provenance {
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--faint);
    margin: 1.25rem 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 1.25rem;
  }

  .summary {
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 6px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .distribution {
    display: flex;
    height: 0.6rem;
    border-radius: 2px;
    overflow: hidden;
    gap: 2px;
  }

  .seg { background: var(--lv); min-width: 3px; }

  .tallies {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.75rem;
  }

  .tally {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
    font-size: 0.85rem;
  }

  .swatch {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 2px;
    background: var(--lv);
    align-self: center;
  }

  .tally-name { color: var(--muted); }

  .tally-count {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--ink);
  }

  .filter {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--rule);
    font-size: 0.9rem;
  }

  .filter input { accent-color: var(--accent); width: 1rem; height: 1rem; }
  .filter label { cursor: pointer; }
  .filter input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .filter .hint { color: var(--faint); font-size: 0.8rem; }

  .group { display: flex; flex-direction: column; gap: 1rem; }

  .group-head {
    border-left: 3px solid var(--lv);
    padding-left: 0.9rem;
  }

  .group-head h2 {
    font-size: 1.15rem;
    font-weight: 650;
    letter-spacing: -0.01em;
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
  }

  .group-count {
    font-family: var(--mono);
    font-size: 0.85rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: var(--lv);
  }

  .group-head p {
    margin: 0.3rem 0 0;
    font-size: 0.85rem;
    color: var(--muted);
    max-width: 44rem;
  }

  .rows { display: flex; flex-direction: column; gap: 1px; }

  .row {
    display: grid;
    grid-template-columns: 3px 1fr auto;
    gap: 0 1rem;
    background: var(--surface);
    border: 1px solid var(--rule);
    align-items: start;
    padding-right: 1rem;
  }

  .rows .row:not(:first-child) { border-top: none; }
  .rows .row:first-child { border-radius: 6px 6px 0 0; }
  .rows .row:last-child { border-radius: 0 0 6px 6px; }
  .rows .row:only-child { border-radius: 6px; }

  .stripe { background: var(--lv); align-self: stretch; }

  .body { padding: 0.85rem 0; min-width: 0; }

  .text {
    margin: 0 0 0.4rem;
    font-size: 1rem;
    line-height: 1.45;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.75rem;
    font-family: var(--mono);
    font-size: 0.7rem;
    color: var(--faint);
  }

  .id { font-weight: 600; color: var(--muted); letter-spacing: 0.04em; }

  .path { display: inline-flex; align-items: center; gap: 0.35rem; }
  .arrow { color: var(--faint); }
  .arrow.moved { color: var(--accent); font-weight: 700; }

  .basis { color: var(--muted); }

  .note {
    color: var(--accent);
    border: 1px solid currentColor;
    border-radius: 2px;
    padding: 0 0.3rem;
    font-size: 0.65rem;
  }

  .expectation {
    padding: 0.9rem 0;
    font-family: var(--mono);
    font-size: 0.7rem;
    white-space: nowrap;
    text-align: right;
  }

  .expected-ok { color: var(--faint); }
  .expected-off { color: var(--off); }
  .expected-off strong { font-weight: 700; }

  .row.off { background: color-mix(in srgb, var(--off) 5%, var(--surface)); }

  body.only-off .row[data-off="false"] { display: none; }
  body.only-off .group:not(:has(.row[data-off="true"])) { display: none; }

  .foot {
    border-top: 1px solid var(--rule);
    padding-top: 1.5rem;
    color: var(--muted);
    font-size: 0.85rem;
    max-width: 44rem;
  }

  @media (max-width: 34rem) {
    .row { grid-template-columns: 3px 1fr; }
    .expectation {
      grid-column: 2;
      padding: 0 0 0.85rem;
      text-align: left;
    }
  }
</style>

<div class="page">
  <header>
    <p class="eyebrow">CrowdSift · 분류 기준 검토</p>
    <h1>댓글 90건이 어느 등급으로 갔는가</h1>
    <p class="lede">
      기준을 바꾸는 데 지금이 가장 싸다. 아직 아무것도 저장하지 않았기 때문이다.
      각 댓글이 받은 등급이 납득되는지만 보면 된다. 오른쪽의 계획서 등급은
      정답이 아니라, 우리가 처음에 적어둔 짐작이다.
    </p>
    <p class="provenance">
      <span>${escape(ranAt)}</span>
      <span>${escape(measurement.models.luna)} · ${escape(measurement.models.terra)}</span>
      <span>${escape(measurement.prompts.luna)}</span>
      <span>${escape(measurement.prompts.terra)}</span>
    </p>
  </header>

  <div class="summary">
    <div class="distribution">${distribution}</div>
    <div class="tallies">${legend}</div>
    <div class="filter">
      <input type="checkbox" id="only-off">
      <label for="only-off">계획서 기대와 갈린 것만 보기</label>
      <span class="hint">${offCount}건 · 미확정으로 적어둔 댓글은 세지 않는다</span>
    </div>
  </div>

  ${sections}

  <footer class="foot">
    갈렸다는 것이 틀렸다는 뜻은 아니다. 계획서의 등급은 팀이 검토해 합의한 값이
    아니라 기준 문서를 읽고 붙인 짐작이다. 판단해야 할 것은 어느 쪽이 옳은지가
    아니라, <strong>지금 나온 등급대로 크리에이터에게 보여줘도 괜찮은지</strong>다.
  </footer>
</div>

<script>
  document.getElementById("only-off").addEventListener("change", (event) => {
    document.body.classList.toggle("only-off", event.target.checked);
  });
</script>
`;

  const target = resolve(process.cwd(), "measurements", "review.html");
  writeFileSync(target, html, "utf8");
  console.log(`측정: ${source}`);
  console.log(`화면: ${target}`);
  console.log(`계획서와 갈린 건 ${offCount}건 / 전체 ${rows.length}건`);
};

main();
