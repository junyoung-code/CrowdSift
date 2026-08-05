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
  type RiskLevel,
  type TerraVerdict,
} from "../src/features/classification/schemas";
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

  console.log(`\n모델: ${lunaModel} / ${terraModel} / ${moderationModel}`);
  console.log(`댓글 ${comments.length}건 처리 중...\n`);

  type Row = TestComment & {
    candidate: RiskLevel;
    lunaCertainty: Certainty;
    verified: boolean;
    terraLevel: RiskLevel | null;
    terraCertainty: Certainty | null;
    terra: TerraVerdict | null;
    verdict: Verdict | null;
    lunaTokens: number;
    terraTokens: number;
  };
  const rows: Row[] = [];

  for (const [index, comment] of comments.entries()) {
    const input: FirstPassInput = {
      commentId: comment.id,
      workspaceId: "measurement",
      sourceText: comment.text,
      videoTitle: comment.video,
      channelId: "measurement",
      profile: DEFAULT_CLASSIFICATION_PROFILE,
      similarExamples: [],
    };

    const first = await firstPass.run(input);
    const routed = routeFirstPass(first);

    if (routed.kind === "instant_safe") {
      rows.push({
        ...comment,
        candidate: first.luna.result.candidateLevel,
        lunaCertainty: first.luna.result.certainty,
        verified: false,
        terraLevel: null,
        terraCertainty: null,
        terra: null,
        verdict: null,
        lunaTokens: first.luna.run.usage.totalTokens,
        terraTokens: 0,
      });
      process.stdout.write(`\r  ${index + 1}/${comments.length}  ${comment.id}      `);
      continue;
    }

    // Terra 입력에 1차 판단이 들어가지 않는다. 분기 이유도 넘기지 않는다.
    const secondInput: SecondPassInput = {
      ...input,
      moderation: first.moderation?.result ?? null,
    };
    const verified = await terra.verify(secondInput);

    rows.push({
      ...comment,
      candidate: first.luna.result.candidateLevel,
      lunaCertainty: first.luna.result.certainty,
      verified: true,
      terraLevel: verified.result.verdictLevel,
      terraCertainty: verified.result.certainty,
      terra: verified.result,
      verdict: decideVerdict({
        candidateLevel: first.luna.result.candidateLevel,
        terra: verified.result,
        moderationMinimumLevel: routed.protection.moderationMinimumLevel,
      }),
      lunaTokens: first.luna.run.usage.totalTokens,
      terraTokens: verified.run.usage.totalTokens,
    });
    process.stdout.write(`\r  ${index + 1}/${comments.length}  ${comment.id}      `);
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

  section("순화를 만들 댓글");
  const rewritable = rows.filter((row) => row.verdict?.allowRewrite);
  console.log(`  ${rewritable.length}건 — 최종 주의이면서 순화할 재료가 있는 것\n`);
  for (const row of rewritable) {
    console.log(`    ${row.id}  "${row.text.slice(0, 30)}"`);
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
  console.log(
    `\n토큰 — Luna ${lunaTokens.toLocaleString()} / ` +
      `Terra ${terraTokens.toLocaleString()} (${checked.length}회) / ` +
      `합계 ${(lunaTokens + terraTokens).toLocaleString()}`,
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
        tokens: { luna: lunaTokens, terra: terraTokens },
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
