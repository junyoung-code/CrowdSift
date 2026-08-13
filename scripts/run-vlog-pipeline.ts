/**
 * 브이로그 테스트 세트를 파이프라인에 통째로 돌린다. DB 를 건드리지 않는다.
 *
 * `report-vlog-run.ts` 는 이미 저장된 판단을 읽는다. 그것은 앱을 거친 진짜 한 판이지만,
 * 프롬프트를 고칠 때마다 사람이 가져오기와 분석을 눌러야 한다. 프롬프트 한 줄이
 * 다른 무리를 망가뜨렸는지 보려고 매번 그 왕복을 할 수는 없다.
 *
 * 그래서 같은 문장을, 같은 순서로, 같은 코드에 넣어 본다. 다른 것은 하나다 —
 * 결과를 저장하지 않는다.
 *
 *   npx tsx scripts/run-vlog-pipeline.ts           전부
 *   npx tsx scripts/run-vlog-pipeline.ts A G       무리만 골라서
 *
 * 대조 규칙은 `report-vlog-run.ts` 와 같다. `open` 은 정답이 없어 세지 않고, `skip` 은
 * 없는 것이 맞은 것이며, 유튜브가 지운 것은 맞고 틀림에서 뺀다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import OpenAI from "openai";

import { routeFirstPass } from "../src/features/classification/branch";
import { finalizeClassification } from "../src/features/classification/finalize";
import { createFirstPassRunner } from "../src/features/classification/first-pass";
import { createLunaFirstPass } from "../src/features/classification/luna-first-pass";
import { createLunaRewrite } from "../src/features/classification/luna-rewrite";
import { createModerationScreen } from "../src/features/classification/moderation";
import {
  LUNA_FIRST_PASS_PROMPT_VERSION,
  TERRA_VERIFICATION_PROMPT_VERSION,
} from "../src/features/classification/prompts";
import {
  DEFAULT_CLASSIFICATION_PROFILE,
  type RiskLevel,
} from "../src/features/classification/schemas";
import { detectSpam } from "../src/features/classification/spam-rules";
import { createTerraVerification } from "../src/features/classification/terra-verification";
import { isTimestampOnlyComment } from "../src/features/ingestion/timestamp-only-comment";
import { loadEnvFile, section } from "./test-comments";
import {
  GROUP_NOTE,
  GROUP_OF,
  VLOG_TEST_SET,
  type Expected,
  type TestEntry,
} from "./vlog-test-set";

/** 모델은 `danger` 라고 하고 DB 와 문서는 `risk` 라고 한다. 대조는 문서 쪽 이름으로 한다. */
const asExpected = (level: RiskLevel): Expected =>
  level === "danger" ? "risk" : level;

const LABEL: Record<string, string> = {
  safe: "🟢안전",
  caution: "🟡주의",
  risk: "🔴위험",
  skip: "⛔제외",
  open: "  —  ",
};

type Outcome =
  | { kind: "skipped" }
  | {
      kind: "classified";
      level: Expected | null;
      status: "decided" | "review_queue";
      basis: string;
      candidate: RiskLevel;
      terraLevel: RiskLevel | null;
      /**
       * 두 모델이 단 신호와 무료 필터의 바닥.
       *
       * 「ㅋㅋㅋㅋㅋ」이 한 판은 안전, 다음 판은 보류로 갔는데 어느 조건이 막았는지
       * 기록이 없어 짚지 못했다. 등급만 남기면 그때마다 다시 돌려야 한다.
       */
      lunaFlags: string[];
      terraFlags: string[];
      terraCertainty: string | null;
      moderationMinimumLevel: RiskLevel | null;
      spamSignals: string[];
      feedbackCore: string | null;
      rewritten: string | null;
    };

const outcomeLabel = (outcome: Outcome) => {
  if (outcome.kind === "skipped") return "⛔제외";
  if (outcome.status === "review_queue" || !outcome.level) return "⏸보류";
  return LABEL[outcome.level] ?? outcome.level;
};

const judge = (entry: TestEntry, outcome: Outcome) => {
  if (entry.removedByYouTube) return "🚫" as const;
  if (entry.expected === "open") return "—" as const;
  if (entry.expected === "skip") return outcome.kind === "skipped" ? "✅" : "❌";
  if (outcome.kind === "skipped") return "❌" as const;
  if (outcome.status === "review_queue" || !outcome.level) return "⏸" as const;
  return outcome.level === entry.expected ? ("✅" as const) : ("❌" as const);
};

/** 연결이 끊겨 한 판을 통째로 잃지 않게 한다. 판단이 흔들리는 것과는 다른 문제다. */
const withRetry = async <T,>(what: string, run: () => Promise<T>): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      const transient =
        error instanceof Error &&
        /connection error|fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT|socket hang up|429/i.test(
          `${error.message} ${String((error as { cause?: unknown }).cause ?? "")}`,
        );
      if (!transient || attempt === 4) throw error;

      const waitMs = 2000 * attempt;
      process.stdout.write(`\n  다시 시도 ${attempt}/3 · ${what} · ${waitMs / 1000}초\n`);
      await new Promise((done) => setTimeout(done, waitMs));
    }
  }

  throw lastError;
};

const main = async () => {
  loadEnvFile();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 가 없다");

  const client = new OpenAI({ apiKey });
  const lunaModel = process.env.OPENAI_LUNA_MODEL ?? "gpt-5.6-luna";
  const terraModel = process.env.OPENAI_TERRA_MODEL ?? "gpt-5.6-terra";
  const moderationModel =
    process.env.OPENAI_MODERATION_MODEL ?? "omni-moderation-latest";

  const firstPass = createFirstPassRunner({
    luna: createLunaFirstPass({ client: client as never, model: lunaModel }),
    moderation: createModerationScreen({
      client: client as never,
      model: moderationModel,
    }),
  });
  const terra = createTerraVerification({
    client: client as never,
    model: terraModel,
  });
  const rewriter = createLunaRewrite({ client: client as never, model: lunaModel });

  const groups = process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map((arg) => arg.toUpperCase());
  const entries = VLOG_TEST_SET.filter(
    (entry) => groups.length === 0 || groups.includes(GROUP_OF(entry.id)),
  );

  const byId = new Map(VLOG_TEST_SET.map((entry) => [entry.id, entry]));
  const videoTitle: Record<1 | 2, string> = {
    1: "퇴근하고 30분, 자취 4년차 냉장고 털이",
    2: "자취방 대청소 + 베란다 정리 브이로그",
  };

  section(
    `브이로그 세트 · ${LUNA_FIRST_PASS_PROMPT_VERSION} / ${TERRA_VERIFICATION_PROMPT_VERSION}`,
  );
  console.log(`  ${entries.length}건 · 은어 목록 비어 있음 · 저장하지 않음\n`);

  const results: { entry: TestEntry; outcome: Outcome; mark: string }[] = [];
  const accepted: string[] = [];
  // 단계별로 센다. 「2차가 세 건 잡으려고 얼마 쓰나」는 2차를 둘지 말지에 붙는 숫자다.
  const tokens = { luna: 0, terra: 0, rewrite: 0 };
  const calls = { luna: 0, terra: 0, rewrite: 0 };

  for (const [index, entry] of entries.entries()) {
    process.stdout.write(`\r  ${index + 1}/${entries.length}  ${entry.id}      `);

    // 수집 단계에서 걸리는 것은 모델을 부르지 않는다. 앱과 같은 순서다.
    if (isTimestampOnlyComment(entry.text)) {
      const outcome: Outcome = { kind: "skipped" };
      results.push({ entry, outcome, mark: judge(entry, outcome) });
      continue;
    }

    const parent = entry.parentId ? byId.get(entry.parentId) : undefined;
    const input = {
      commentId: entry.id,
      workspaceId: "vlog-run",
      sourceText: entry.text,
      videoTitle: videoTitle[entry.video],
      channelId: "vlog-run",
      profile: DEFAULT_CLASSIFICATION_PROFILE,
      similarExamples: [],
      parent: parent ? { id: parent.id, text: parent.text } : null,
    };

    const first = await withRetry(`${entry.id} 1차`, () => firstPass.run(input));
    tokens.luna += first.luna.run.usage.totalTokens;
    calls.luna += 1;
    const branch = routeFirstPass(first);

    const verified =
      branch.kind === "verify"
        ? await withRetry(`${entry.id} 2차`, () =>
            terra.verify({ ...input, moderation: first.moderation?.result ?? null }),
          )
        : null;
    if (verified) {
      tokens.terra += verified.run.usage.totalTokens;
      calls.terra += 1;
    }

    const verdict = finalizeClassification({
      firstPass: first,
      branch,
      spam: detectSpam(entry.text),
      terra: verified?.result ?? null,
    });

    const feedbackCore = verified?.result.feedbackCore ?? null;
    const rewritten =
      verdict.allowRewrite && feedbackCore
        ? await withRetry(`${entry.id} 순화`, () =>
            rewriter.rewrite({
              commentId: entry.id,
              sourceText: entry.text,
              feedbackCore,
              profile: DEFAULT_CLASSIFICATION_PROFILE,
              recentRewrites: accepted,
            }),
          )
        : null;
    if (rewritten) {
      tokens.rewrite += rewritten.run.usage.totalTokens;
      calls.rewrite += 1;
      if (rewritten.inspection.accepted) accepted.push(rewritten.result.rewritten);
    }

    const outcome: Outcome = {
      kind: "classified",
      level: verdict.level ? asExpected(verdict.level) : null,
      status: verdict.status,
      basis: verdict.basis,
      candidate: first.luna.result.candidateLevel,
      terraLevel: verified?.result.verdictLevel ?? null,
      lunaFlags: [
        ...first.luna.result.hardRiskFlags,
        ...first.luna.result.softRiskFlags,
      ],
      terraFlags: verified
        ? [...verified.result.hardRiskFlags, ...verified.result.softRiskFlags]
        : [],
      terraCertainty: verified?.result.certainty ?? null,
      moderationMinimumLevel:
        branch.kind === "verify" ? branch.protection.moderationMinimumLevel : null,
      spamSignals: verdict.spamSignals,
      feedbackCore,
      rewritten: rewritten?.inspection.accepted
        ? rewritten.result.rewritten
        : null,
    };
    results.push({ entry, outcome, mark: judge(entry, outcome) });
  }

  console.log("\n");

  let group = "";
  let hit = 0;
  let counted = 0;

  for (const { entry, outcome, mark } of results) {
    const current = GROUP_OF(entry.id);
    if (current !== group) {
      group = current;
      console.log(`\n── ${group}  ${GROUP_NOTE[group] ?? ""}`);
    }

    if (mark === "✅" || mark === "❌") {
      counted += 1;
      if (mark === "✅") hit += 1;
    }

    const path =
      outcome.kind === "classified" && outcome.terraLevel
        ? `  ${outcome.candidate.slice(0, 2)}→${outcome.terraLevel.slice(0, 2)}`
        : "";
    console.log(
      `${mark} ${entry.id}  ${LABEL[entry.expected]} → ${outcomeLabel(outcome)}${path}  ${entry.text.slice(0, 30)}`,
    );
  }

  console.log(`\n맞음 ${hit} / 센 것 ${counted}  (정답 없는 것과 보류는 세지 않음)`);

  section("어긋난 것");
  const wrong = results.filter((row) => row.mark === "❌" || row.mark === "⏸");
  if (wrong.length === 0) console.log("  없음");
  for (const { entry, outcome, mark } of wrong) {
    console.log(`  ${mark} ${entry.id}  ${entry.text}`);
    if (outcome.kind === "classified") {
      console.log(
        `       기대 ${entry.expected} · 실제 ${outcome.level ?? "보류"} · ${outcome.basis}`,
      );
    }
  }

  section("G 무리 — 주의로 가도 요청이 남았는가");
  for (const { entry, outcome } of results.filter(
    (row) => GROUP_OF(row.entry.id) === "G" && row.outcome.kind === "classified",
  )) {
    if (outcome.kind !== "classified") continue;
    console.log(`  ${entry.id}  ${entry.text}`);
    console.log(`       재료  ${outcome.feedbackCore ?? "(없음)"}`);
    console.log(`       순화  ${outcome.rewritten ?? "(만들지 않음)"}\n`);
  }

  section("스팸 규칙이 올린 것");
  const spammed = results.filter(
    (row) => row.outcome.kind === "classified" && row.outcome.spamSignals.length > 0,
  );
  if (spammed.length === 0) console.log("  없음");
  for (const { entry, outcome } of spammed) {
    if (outcome.kind !== "classified") continue;
    console.log(`  ${entry.id}  ${outcome.spamSignals.join(" · ")}  ${entry.text}`);
  }

  section("토큰");
  const total = tokens.luna + tokens.terra + tokens.rewrite;
  for (const [stage, used] of Object.entries(tokens)) {
    const count = calls[stage as keyof typeof calls];
    console.log(
      `  ${stage.padEnd(8)} ${used.toLocaleString().padStart(9)}  ` +
        `${((used / Math.max(total, 1)) * 100).toFixed(1).padStart(5)}%  ${count}회`,
    );
  }
  console.log(`  ${"합계".padEnd(7)} ${total.toLocaleString().padStart(9)}`);


  const directory = resolve(process.cwd(), "measurements");
  mkdirSync(directory, { recursive: true });
  const path = resolve(
    directory,
    `vlog-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(
    path,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        prompts: {
          luna: LUNA_FIRST_PASS_PROMPT_VERSION,
          terra: TERRA_VERIFICATION_PROMPT_VERSION,
        },
        models: { luna: lunaModel, terra: terraModel, moderation: moderationModel },
        score: { hit, counted },
        tokens,
        calls,
        rows: results,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`남겼다: ${path}\n`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
