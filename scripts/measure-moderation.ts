/**
 * 무료 필터가 한국어 댓글에 무엇을 보는지 점수까지 들여다본다.
 *
 * 걸렸는지(flagged)만 보면 "못 잡았다"까지만 알 수 있고, 문턱을 아깝게 못 넘긴 것인지
 * 아예 신호가 없는 것인지 구분이 안 된다. 모더레이션은 무료라 전건을 돌려도 비용이 없다.
 *
 *   npx tsx scripts/measure-moderation.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createModerationScreen } from "../src/features/classification/moderation";

const loadEnvFile = () => {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");

  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !process.env[match[1]!]) {
      process.env[match[1]!] = match[2]!;
    }
  }
};

type TestComment = { id: string; text: string; expected: string };

const readTestComments = (): TestComment[] => {
  const raw = readFileSync(
    resolve(process.cwd(), "docs/test-comment-plan.md"),
    "utf8",
  );
  const comments: TestComment[] = [];
  let inVideo = false;

  for (const line of raw.split(/\r?\n/)) {
    if (/^## 영상 [ABC] —/.test(line)) {
      inVideo = true;
      continue;
    }
    if (!inVideo || !line.startsWith("|")) continue;

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim().replace(/\*\*/g, ""));
    const [id, , text, expected] = cells;

    if (!id || !text || !expected) continue;
    if (!/^[ABC]\d{2}$/.test(id)) continue;

    comments.push({ id, text, expected });
  }

  return comments;
};

const levelOf = (expected: string) =>
  expected.includes("위험")
    ? "위험"
    : expected.includes("주의")
      ? "주의"
      : expected.includes("안전")
        ? "안전"
        : "미확정";

const main = async () => {
  loadEnvFile();

  const comments = readTestComments();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 가 없습니다");

  const { default: OpenAI } = await import("openai");
  const screen = createModerationScreen({
    client: new OpenAI({ apiKey }) as never,
    model: process.env.OPENAI_MODERATION_MODEL ?? "omni-moderation-latest",
  });

  console.log(`\n무료 필터 단독 측정 · 댓글 ${comments.length}건\n`);

  type Row = TestComment & {
    level: string;
    flagged: boolean;
    categories: string[];
    top: Array<[string, number]>;
  };
  const rows: Row[] = [];

  for (const [index, comment] of comments.entries()) {
    const { result } = await screen.screen(comment.text);
    const top = Object.entries(result.categoryScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3) as Array<[string, number]>;

    rows.push({
      ...comment,
      level: levelOf(comment.expected),
      flagged: result.flagged,
      categories: [...result.categories, ...result.unknownCategories],
      top,
    });
    process.stdout.write(`\r  ${index + 1}/${comments.length}   `);
  }

  console.log("\n");

  const section = (title: string) => {
    console.log(`\n${"=".repeat(74)}`);
    console.log(title);
    console.log("=".repeat(74));
  };

  section("우리가 위험으로 적어둔 댓글에 무료 필터가 준 점수");
  console.log("  (걸림 여부와 무관하게 가장 높은 점수 세 개)\n");
  for (const row of rows.filter((item) => item.level === "위험")) {
    const mark = row.flagged ? "🚩" : "  ";
    const scores = row.top
      .map(([name, score]) => `${name} ${score.toFixed(3)}`)
      .join("  ");
    console.log(`  ${mark} ${row.id} "${row.text.slice(0, 24)}"`);
    console.log(`      ${scores}`);
  }

  section("걸린 댓글 전체");
  for (const row of rows.filter((item) => item.flagged)) {
    console.log(
      `  ${row.id} [${row.level}] "${row.text.slice(0, 30)}"\n      걸린 범주: ${row.categories.join(", ")}`,
    );
  }

  section("등급별 최고 점수 분포");
  for (const level of ["안전", "주의", "위험", "미확정"]) {
    const group = rows.filter((row) => row.level === level);
    if (group.length === 0) continue;

    const peaks = group
      .map((row) => row.top[0]?.[1] ?? 0)
      .sort((a, b) => b - a);
    const flagged = group.filter((row) => row.flagged).length;
    const median = peaks[Math.floor(peaks.length / 2)] ?? 0;

    console.log(
      `  ${level.padEnd(5)} ${String(group.length).padStart(2)}건 · 걸림 ${flagged}건 · ` +
        `최고점 ${peaks[0]!.toFixed(3)} / 중앙 ${median.toFixed(3)} / 최저 ${peaks.at(-1)!.toFixed(3)}`,
    );
  }

  section("점수가 0.01 을 넘긴 댓글 (문턱은 못 넘겼어도 신호는 있는 것)");
  const nearMiss = rows
    .filter((row) => !row.flagged && (row.top[0]?.[1] ?? 0) > 0.01)
    .sort((a, b) => (b.top[0]?.[1] ?? 0) - (a.top[0]?.[1] ?? 0));
  if (nearMiss.length === 0) {
    console.log("  (없음 — 걸리지 않은 건 사실상 점수가 0에 가깝다)");
  }
  for (const row of nearMiss.slice(0, 20)) {
    console.log(
      `  ${row.id} [${row.level}] ${row.top[0]![0]} ${row.top[0]![1].toFixed(3)}  "${row.text.slice(0, 28)}"`,
    );
  }

  console.log("");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
