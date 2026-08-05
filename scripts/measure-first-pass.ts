/**
 * 1단계(Moderation + Luna)를 실제 댓글에 돌려 확신도 분포를 잰다.
 *
 * 확신도가 라우팅 신호로 쓸 만한지 보기 위한 도구다. 소수 0~1 일 때는 값이 다섯 개에
 * 뭉쳤고 틀린 판단에도 높은 값이 붙었다. 세 단계로 바꾼 뒤에도 전부 clear 로 몰리면
 * 확신도를 라우팅에서 빼야 한다. Terra 없이도 돌아간다.
 *
 *   npx tsx scripts/measure-first-pass.ts          전체
 *   npx tsx scripts/measure-first-pass.ts 5        앞 5건만 (연결 확인용)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { routeFirstPass } from "../src/features/classification/branch";
import type { FirstPassInput } from "../src/features/classification/contracts";
import { createFirstPassRunner } from "../src/features/classification/first-pass";
import { createLunaFirstPass } from "../src/features/classification/luna-first-pass";
import { createModerationScreen } from "../src/features/classification/moderation";
import {
  CertaintySchema,
  DEFAULT_CLASSIFICATION_PROFILE,
  type Certainty,
} from "../src/features/classification/schemas";

const loadEnvFile = () => {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");

  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !process.env[match[1]!]) {
      process.env[match[1]!] = match[2]!;
    }
  }
};

type TestComment = {
  id: string;
  text: string;
  expected: string;
  video: string;
};

/**
 * 테스트 계획 문서의 표에서 댓글을 읽는다. 문서가 하나뿐인 출처로 남게 하려는 것이다.
 */
const readTestComments = (): TestComment[] => {
  const raw = readFileSync(
    resolve(process.cwd(), "docs/test-comment-plan.md"),
    "utf8",
  );
  const comments: TestComment[] = [];
  let video = "";

  for (const line of raw.split(/\r?\n/)) {
    const heading = /^## 영상 ([ABC]) —/.exec(line);
    if (heading) {
      video = heading[1]!;
      continue;
    }

    if (!video || !line.startsWith("|")) continue;

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim().replace(/\*\*/g, ""));
    const [id, , text, expected] = cells;

    if (!id || !text || !expected) continue;
    if (!/^[ABC]\d{2}$/.test(id)) continue;

    comments.push({ id, text, expected, video });
  }

  return comments;
};

const bar = (count: number, total: number, width = 30) =>
  "█".repeat(Math.round((count / Math.max(total, 1)) * width));

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
  const moderationModel =
    process.env.OPENAI_MODERATION_MODEL ?? "omni-moderation-latest";

  const moderationFailures: string[] = [];
  const runner = createFirstPassRunner({
    luna: createLunaFirstPass({ client: client as never, model: lunaModel }),
    moderation: createModerationScreen({
      client: client as never,
      model: moderationModel,
    }),
    onModerationError: (_error, commentId) =>
      moderationFailures.push(commentId),
  });

  console.log(`\n모델: ${lunaModel} / ${moderationModel}`);
  console.log(`댓글 ${comments.length}건 처리 중...\n`);

  type Row = TestComment & {
    candidate: string;
    certainty: Certainty;
    routed: string;
    reasons: string[];
    moderationFlagged: boolean | null;
    moderationCategories: string[];
    tokens: number;
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

    try {
      const first = await runner.run(input);
      const outcome = routeFirstPass(first);

      rows.push({
        ...comment,
        candidate: first.luna.result.candidateLevel,
        certainty: first.luna.result.certainty,
        routed: outcome.kind,
        reasons: outcome.kind === "verify" ? outcome.reasons : [],
        moderationFlagged: first.moderation?.result.flagged ?? null,
        moderationCategories: first.moderation?.result.categories ?? [],
        tokens: first.luna.run.usage.totalTokens,
      });
      process.stdout.write(
        `\r  ${index + 1}/${comments.length}  ${comment.id}      `,
      );
    } catch (error) {
      console.error(`\n  ${comment.id} 실패:`, (error as Error).message);
      throw error;
    }
  }

  console.log("\n");
  console.log("=".repeat(70));
  console.log("확신도 분포");
  console.log("=".repeat(70));

  for (const certainty of CertaintySchema.options) {
    const hits = rows.filter((row) => row.certainty === certainty);
    console.log(
      `  ${certainty.padEnd(10)}  ${String(hits.length).padStart(3)}건  ` +
        `${((hits.length / rows.length) * 100).toFixed(1)}%  ${bar(hits.length, rows.length)}`,
    );
  }

  // 전부 clear 로 뭉치면 3단으로 바꾼 것도 소수와 다를 바 없다. 그때는 확신도를
  // 라우팅에서 빼는 편이 정직하다.
  const clear = rows.filter((row) => row.certainty === "clear").length;
  console.log(
    `\n  clear 비율 ${((clear / rows.length) * 100).toFixed(1)}% ` +
      `— 100% 에 가까우면 눈금이 뜻을 갖지 못한 것이다`,
  );

  console.log("\n  후보 등급별로 어디에 떨어졌는가");
  for (const level of ["safe", "caution", "danger"] as const) {
    const group = rows.filter((row) => row.candidate === level);
    if (group.length === 0) continue;

    const counts = CertaintySchema.options.map(
      (certainty) =>
        `${certainty} ${group.filter((row) => row.certainty === certainty).length}`,
    );
    console.log(
      `    ${level.padEnd(8)} ${String(group.length).padStart(2)}건 · ${counts.join(" / ")}`,
    );
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("분기 결과");
  console.log("=".repeat(70));
  const instant = rows.filter((row) => row.routed === "instant_safe");
  console.log(
    `  즉시 안전 확정 : ${instant.length}건 (${((instant.length / rows.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  Terra 로 넘김  : ${rows.length - instant.length}건 (${(((rows.length - instant.length) / rows.length) * 100).toFixed(1)}%)  ← 여기가 비용`,
  );

  console.log("\n  넘긴 이유 (중복 포함)");
  const reasonCounts = new Map<string, number>();
  for (const row of rows) {
    for (const reason of row.reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }
  for (const [reason, count] of [...reasonCounts].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${reason.padEnd(30)} ${String(count).padStart(3)}건`);
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("무료 필터가 한국어를 잡는가");
  console.log("=".repeat(70));
  const flagged = rows.filter((row) => row.moderationFlagged === true);
  console.log(
    `  걸린 건 : ${flagged.length}/${rows.length} (${((flagged.length / rows.length) * 100).toFixed(1)}%)`,
  );
  if (moderationFailures.length > 0) {
    console.log(`  호출 실패: ${moderationFailures.length}건`);
  }
  const expectedDanger = rows.filter((row) => row.expected.includes("위험"));
  const caughtDanger = expectedDanger.filter(
    (row) => row.moderationFlagged === true,
  );
  console.log(
    `  위험으로 적어둔 ${expectedDanger.length}건 중 필터가 잡은 건: ${caughtDanger.length}건`,
  );
  for (const row of flagged.slice(0, 8)) {
    console.log(
      `    ${row.id} [${row.moderationCategories.join(", ")}] "${row.text.slice(0, 26)}"`,
    );
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("Luna 후보 vs 문서에 적어둔 기대 등급");
  console.log("=".repeat(70));
  console.log("  (기대 등급은 정답이 아니라 참고용이다)\n");
  const label: Record<string, string> = {
    safe: "🟢 안전",
    caution: "🟡 주의",
    danger: "🔴 위험",
  };
  for (const row of rows) {
    const same = row.expected.includes(label[row.candidate]?.slice(2) ?? "");
    console.log(
      `  ${same ? " " : "≠"} ${row.id}  ${label[row.candidate]}  ${row.certainty.padEnd(10)}  ` +
        `기대 ${row.expected.padEnd(8)} "${row.text.slice(0, 24)}"`,
    );
  }

  const totalTokens = rows.reduce((sum, row) => sum + row.tokens, 0);
  console.log(
    `\n총 토큰 ${totalTokens.toLocaleString()} (Luna 기준, 모더레이션은 무료)\n`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
