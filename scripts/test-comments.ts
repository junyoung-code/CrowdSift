import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 측정 스크립트가 공유하는 입력. 테스트 댓글은 계획 문서에만 있고, 여기서는 읽기만 한다.
 */

export const loadEnvFile = () => {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");

  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !process.env[match[1]!]) {
      process.env[match[1]!] = match[2]!;
    }
  }
};

export type TestComment = {
  id: string;
  text: string;
  expected: string;
  video: string;
  /** 답글이면 부모 ID. 계획서 표의 `↳ A05` 표시에서 읽는다. */
  parentId: string | null;
};

/**
 * 테스트 계획 문서의 표에서 댓글을 읽는다. 문서가 하나뿐인 출처로 남게 하려는 것이다.
 */
export const readTestComments = (): TestComment[] => {
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
    const [id, kind, text, expected] = cells;

    if (!id || !text || !expected) continue;
    if (!/^[ABC]\d{2}$/.test(id)) continue;

    const parent = /^↳\s*([ABC]\d{2})$/.exec(kind ?? "");

    comments.push({
      id,
      text,
      expected,
      video,
      parentId: parent ? parent[1]! : null,
    });
  }

  return comments;
};

export const bar = (count: number, total: number, width = 30) =>
  "█".repeat(Math.round((count / Math.max(total, 1)) * width));

export const section = (title: string, width = 70) => {
  console.log(`\n${"=".repeat(width)}`);
  console.log(title);
  console.log("=".repeat(width));
};
