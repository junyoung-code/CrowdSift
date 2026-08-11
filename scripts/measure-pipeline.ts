/**
 * 파이프라인 전체를 실제 댓글에 돌린다. 1차 → 분기 → Terra → 확정.
 *
 * 여기서 처음으로 최종 등급이 나온다. 1차 측정과 달리 Terra 호출 비용이 붙으므로
 * 건수를 제한할 수 있게 두었다.
 *
 *   npx tsx scripts/measure-pipeline.ts          전체
 *   npx tsx scripts/measure-pipeline.ts 10       앞 10건만
 *
 * 결과는 화면과 `measurements/pipeline-<시각>.json` 양쪽에 남는다. 한 번 도는 데
 * 십수 분이 걸리므로, 결과를 다시 보려고 다시 부르지 않게 한다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { routeFirstPass } from "../src/features/classification/branch";
import type {
  FirstPassInput,
  SecondPassInput,
} from "../src/features/classification/contracts";
import { createFirstPassRunner } from "../src/features/classification/first-pass";
import { createLunaFirstPass } from "../src/features/classification/luna-first-pass";
import { createModerationScreen } from "../src/features/classification/moderation";
import { LUNA_FIRST_PASS_PROMPT_VERSION } from "../src/features/classification/prompts";
import {
  DEFAULT_CLASSIFICATION_PROFILE,
  type Certainty,
  type LunaFirstPass,
  type RiskLevel,
  type Rewrite,
  type TerraVerdict,
} from "../src/features/classification/schemas";
import { createLunaRewrite } from "../src/features/classification/luna-rewrite";
import type { RewriteInspection } from "../src/features/classification/rewrite-guard";
import { createTerraVerification } from "../src/features/classification/terra-verification";
import { decideVerdict, type Verdict } from "../src/features/classification/verdict";
import {
  bar,
  loadEnvFile,
  readTestComments,
  section,
  type TestComment,
} from "./test-comments";

const label: Record<RiskLevel, string> = {
  safe: "🟢 안전",
  caution: "🟡 주의",
  danger: "🔴 위험",
};

const finalLabel = (verdict: Verdict | null) => {
  if (!verdict) return "즉시 안전";
  if (verdict.status === "review_queue") return "⏸ 검토 대기";
  return label[verdict.level!];
};

/**
 * 90건을 다 돌리는 데 10분이 걸린다. 그 사이 연결이 한 번 끊기면
 * 그때까지의 호출이 통째로 버려진다. 두 번 그렇게 날렸다.
 *
 * 판단이 흔들리는 것과 연결이 끊기는 것은 다른 문제다. 후자는 여기서 삼킨다.
 */
const withRetry = async <T,>(label: string, run: () => Promise<T>): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      const transient =
        error instanceof Error &&
        /connection error|fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT|socket hang up/i.test(
          `${error.message} ${String((error as { cause?: unknown }).cause ?? "")}`,
        );
      if (!transient || attempt === 4) throw error;

      const waitMs = 2000 * attempt;
      process.stdout.write(`\n  연결 끊김 · ${label} · ${waitMs / 1000}초 후 재시도 ${attempt}/3\n`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError;
};

const main = async () => {
  loadEnvFile();

  const limit = Number(process.argv[2] ?? "0");
  const all = readTestComments();
  const comments = limit > 0 ? all.slice(0, limit) : all;

  if (comments.length === 0) {
    throw new Error("테스트 댓글을 읽지 못했습니다");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 가 없습니다");

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });
  const lunaModel = process.env.OPENAI_LUNA_MODEL ?? "gpt-5.6-luna";
  const terraModel = process.env.OPENAI_TERRA_MODEL ?? "gpt-5.6-terra";
  const moderationModel =
    process.env.OPENAI_MODERATION_MODEL ?? "omni-moderation-latest";

  const moderationFailures: string[] = [];
  const firstPass = createFirstPassRunner({
    luna: createLunaFirstPass({ client: client as never, model: lunaModel }),
    moderation: createModerationScreen({
      client: client as never,
      model: moderationModel,
    }),
    onModerationError: (_error, commentId) =>
      moderationFailures.push(commentId),
  });
  const terra = createTerraVerification({
    client: client as never,
    model: terraModel,
  });
  const rewriter = createLunaRewrite({
    client: client as never,
    model: lunaModel,
  });

  console.log(`\n모델: ${lunaModel} / ${terraModel} / ${moderationModel}`);
  console.log(`댓글 ${comments.length}건 처리 중...\n`);

  type Row = TestComment & {
    candidate: RiskLevel;
    lunaCertainty: Certainty;
    /** 왜 그렇게 판단했는지 나중에 되짚을 수 있게 1차 원본을 통째로 남긴다. */
    luna: LunaFirstPass;
    verified: boolean;
    terraLevel: RiskLevel | null;
    terraCertainty: Certainty | null;
    terra: TerraVerdict | null;
    verdict: Verdict | null;
    rewrite: Rewrite | null;
    inspection: RewriteInspection | null;
    lunaTokens: number;
    terraTokens: number;
    rewriteTokens: number;
  };
  // 답글의 부모를 찾기 위한 색인. 계획서 표는 게시 순서라 부모가 항상 앞에 있다.
  const byId = new Map(all.map((item) => [item.id, item]));

  /** 최근 순화문. 같은 말투가 줄줄이 이어지지 않게 다음 호출에 넘긴다. */
  const accepted: string[] = [];

  const rows: Row[] = [];

  // 도중에 죽어도 그때까지의 결과는 남긴다. 90건을 다시 부르는 비용이 아깝다.
  let stoppedAt: string | null = null;

  try {
    for (const [index, comment] of comments.entries()) {
    const input: FirstPassInput = {
      commentId: comment.id,
      workspaceId: "measurement",
      sourceText: comment.text,
      videoTitle: comment.video,
      channelId: "measurement",
      profile: DEFAULT_CLASSIFICATION_PROFILE,
      similarExamples: [],
      parent: comment.parentId
        ? {
            id: comment.parentId,
            text: byId.get(comment.parentId)?.text ?? "",
          }
        : null,
    };

    const first = await withRetry(`${comment.id} 1차`, () => firstPass.run(input));
    const routed = routeFirstPass(first);

    if (routed.kind === "instant_safe") {
      rows.push({
        ...comment,
        candidate: first.luna.result.candidateLevel,
        lunaCertainty: first.luna.result.certainty,
        luna: first.luna.result,
        verified: false,
        terraLevel: null,
        terraCertainty: null,
        terra: null,
        verdict: null,
        rewrite: null,
        inspection: null,
        lunaTokens: first.luna.run.usage.totalTokens,
        terraTokens: 0,
        rewriteTokens: 0,
      });
      process.stdout.write(`\r  ${index + 1}/${comments.length}  ${comment.id}      `);
      continue;
    }

    // Terra 입력에 1차 판단이 들어가지 않는다. 분기 이유도 넘기지 않는다.
    const secondInput: SecondPassInput = {
      ...input,
      moderation: first.moderation?.result ?? null,
    };
    const verified = await withRetry(`${comment.id} Terra`, () =>
      terra.verify(secondInput),
    );
    const verdict = decideVerdict({
      candidate: {
        level: first.luna.result.candidateLevel,
        hardRiskFlags: first.luna.result.hardRiskFlags,
        softRiskFlags: first.luna.result.softRiskFlags,
      },
      terra: verified.result,
      moderationMinimumLevel: routed.protection.moderationMinimumLevel,
    });

    // 4. 순화. 부를지 말지는 코드가 이미 정해 두었다.
    const rewritten =
      verdict.allowRewrite && verified.result.feedbackCore
        ? await withRetry(`${comment.id} 순화`, () =>
            rewriter.rewrite({
              commentId: comment.id,
              sourceText: comment.text,
              feedbackCore: verified.result.feedbackCore!,
              profile: DEFAULT_CLASSIFICATION_PROFILE,
              recentRewrites: accepted,
            }),
          )
        : null;

    // 검사를 통과한 것만 다음 순화의 참고 문체가 된다.
    if (rewritten?.inspection.accepted) {
      accepted.push(rewritten.result.rewritten);
    }

    rows.push({
      ...comment,
      candidate: first.luna.result.candidateLevel,
      lunaCertainty: first.luna.result.certainty,
      luna: first.luna.result,
      verified: true,
      terraLevel: verified.result.verdictLevel,
      terraCertainty: verified.result.certainty,
      terra: verified.result,
      verdict,
      rewrite: rewritten?.result ?? null,
      inspection: rewritten?.inspection ?? null,
      lunaTokens: first.luna.run.usage.totalTokens,
      terraTokens: verified.run.usage.totalTokens,
      rewriteTokens: rewritten?.run.usage.totalTokens ?? 0,
    });
    process.stdout.write(`\r  ${index + 1}/${comments.length}  ${comment.id}      `);
    }
  } catch (error) {
    stoppedAt = error instanceof Error ? error.message : String(error);
    console.error(
      `\n\n중단: ${stoppedAt}\n지금까지의 ${rows.length}건으로 정리한다.\n`,
    );
  }

  console.log("\n");

  const checked = rows.filter((row) => row.verified);

  section("최종 등급 분포");
  const finals = new Map<string, number>();
  for (const row of rows) {
    const key = finalLabel(row.verdict);
    finals.set(key, (finals.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...finals].sort((a, b) => b[1] - a[1])) {
    console.log(
      `  ${key.padEnd(12)} ${String(count).padStart(3)}건  ` +
        `${((count / rows.length) * 100).toFixed(1)}%  ${bar(count, rows.length)}`,
    );
  }

  section("두 판단이 갈렸는가");
  const agreed = checked.filter((row) => row.verdict!.agreedWithFirstPass);
  console.log(
    `  검증한 ${checked.length}건 중 일치 ${agreed.length}건 · ` +
      `불일치 ${checked.length - agreed.length}건 ` +
      `(${(((checked.length - agreed.length) / Math.max(checked.length, 1)) * 100).toFixed(1)}%)`,
  );
  console.log("\n  불일치 전체");
  for (const row of checked.filter((item) => !item.verdict!.agreedWithFirstPass)) {
    console.log(
      `    ${row.id}  Luna ${label[row.candidate]} → Terra ${label[row.terraLevel!]}` +
        ` ⇒ ${finalLabel(row.verdict)}  [${row.verdict!.basis}]  "${row.text.slice(0, 22)}"`,
    );
  }

  section("확정 근거");
  const bases = new Map<string, number>();
  for (const row of checked) {
    bases.set(row.verdict!.basis, (bases.get(row.verdict!.basis) ?? 0) + 1);
  }
  for (const [basis, count] of [...bases].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${basis.padEnd(32)} ${String(count).padStart(3)}건`);
  }

  section("검토 대기로 간 댓글");
  const queued = rows.filter((row) => row.verdict?.status === "review_queue");
  console.log(`  ${queued.length}건\n`);
  for (const row of queued) {
    console.log(
      `    ${row.id}  Luna ${label[row.candidate]} / Terra ${label[row.terraLevel!]}  "${row.text.slice(0, 26)}"`,
    );
  }

  section("순화");
  const rewritable = rows.filter((row) => row.verdict?.allowRewrite);
  const passed = rewritable.filter((row) => row.inspection?.accepted);
  console.log(
    `  대상 ${rewritable.length}건 · 통과 ${passed.length}건 · ` +
      `걸러냄 ${rewritable.length - passed.length}건`,
  );

  const rejections = new Map<string, number>();
  for (const row of rewritable) {
    for (const reason of row.inspection?.rejections ?? []) {
      rejections.set(reason, (rejections.get(reason) ?? 0) + 1);
    }
  }
  if (rejections.size > 0) {
    console.log("\n  걸러낸 이유");
    for (const [reason, count] of [...rejections].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${reason.padEnd(26)} ${count}건`);
    }
  }

  console.log("\n  원문 → 재료 → 순화문\n");
  for (const row of rewritable) {
    const mark = row.inspection?.accepted ? " " : "✗";
    console.log(`  ${mark} ${row.id}  ${row.text}`);
    console.log(`       재료  ${row.terra!.feedbackCore}`);
    console.log(
      `       순화  ${row.rewrite?.rewritten ?? "(없음)"}` +
        `   [${row.rewrite?.toneVariant ?? "-"}]`,
    );
    if (row.inspection && !row.inspection.accepted) {
      console.log(`       버림  ${row.inspection.rejections.join(", ")}`);
    }
    console.log("");
  }

  section("순화를 만들지 않은 주의 댓글");
  const noRewrite = rows.filter(
    (row) => row.verdict?.level === "caution" && !row.verdict.allowRewrite,
  );
  console.log(`  ${noRewrite.length}건 — 뽑아낼 의견이 없어 만들지 않는다\n`);
  for (const row of noRewrite) {
    console.log(`    ${row.id}  ${row.text}`);
  }

  section("전체 대조");
  console.log("  (기대 등급은 정답이 아니라 참고용이다)\n");
  for (const row of rows) {
    const final = finalLabel(row.verdict);
    const same = row.expected.includes(final.slice(2));
    const path = row.verified
      ? `${label[row.candidate].slice(0, 2)}→${label[row.terraLevel!].slice(0, 2)}`
      : "  즉시";
    console.log(
      `  ${same ? " " : "≠"} ${row.id}  ${path}  ⇒ ${final.padEnd(10)} ` +
        `기대 ${row.expected.padEnd(8)} "${row.text.slice(0, 24)}"`,
    );
  }

  const lunaTokens = rows.reduce((sum, row) => sum + row.lunaTokens, 0);
  const terraTokens = rows.reduce((sum, row) => sum + row.terraTokens, 0);
  const rewriteTokens = rows.reduce((sum, row) => sum + row.rewriteTokens, 0);
  console.log(
    `\n토큰 — Luna ${lunaTokens.toLocaleString()} / ` +
      `Terra ${terraTokens.toLocaleString()} (${checked.length}회) / ` +
      `순화 ${rewriteTokens.toLocaleString()} (${rewritable.length}회) / ` +
      `합계 ${(lunaTokens + terraTokens + rewriteTokens).toLocaleString()}`,
  );
  if (moderationFailures.length > 0) {
    console.log(`모더레이션 호출 실패 ${moderationFailures.length}건`);
  }

  const directory = resolve(process.cwd(), "measurements");
  mkdirSync(directory, { recursive: true });
  const path = resolve(
    directory,
    `pipeline-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(
    path,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        models: { luna: lunaModel, terra: terraModel, moderation: moderationModel },
        prompts: {
          luna: LUNA_FIRST_PASS_PROMPT_VERSION,
          terra: terra.promptVersion,
        },
        tokens: { luna: lunaTokens, terra: terraTokens, rewrite: rewriteTokens },
        // 끝까지 돈 측정만 이전 회차와 나란히 놓을 수 있다.
        completed: stoppedAt === null,
        stoppedAt,
        rows,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\n결과를 남겼다: ${path}\n`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
