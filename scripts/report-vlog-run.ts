/**
 * 브이로그 테스트 세트를 돌린 뒤, DB 에 남은 판단을 문서의 기대와 대조한다.
 *
 * 모델을 부르지 않는다. 이미 저장된 것을 읽기만 하므로 몇 번을 돌려도 공짜다.
 *
 *   npx tsx scripts/report-vlog-run.ts              전부
 *   npx tsx scripts/report-vlog-run.ts A B          무리만 골라서
 *   npx tsx scripts/report-vlog-run.ts --after-slang  은어 등록 후 기대로 대조
 *
 * 댓글 원문을 열쇠로 삼는다. 유튜브가 앞에 붙이는 `@사용자명` 과 공백은 떼고 맞춘다.
 * 원문을 한 글자라도 고쳐 달았으면 「없음」으로 나온다 — 그게 맞다. 조용히 비슷한
 * 것에 붙이면 무엇을 재는지 알 수 없게 된다.
 */
import { createClient } from "@supabase/supabase-js";

import { loadEnvFile } from "./test-comments";
import {
  GROUP_NOTE,
  GROUP_OF,
  VLOG_TEST_SET,
  type Expected,
  type TestEntry,
} from "./vlog-test-set";

type Actual =
  | { kind: "missing" }
  | {
      kind: "found";
      level: "safe" | "caution" | "danger" | null;
      status: string;
      hasMention: boolean;
      parentText: string | null;
      feedbackCore: string | null;
      rewritten: string | null;
    };

const LABEL: Record<string, string> = {
  safe: "🟢안전",
  caution: "🟡주의",
  risk: "🔴위험",
  skip: "⛔제외",
  open: "  —  ",
};

const levelLabel = (actual: Actual) => {
  if (actual.kind === "missing") return "⛔없음";
  if (actual.status === "review_queue" || actual.level === null) return "⏸보류";
  return LABEL[actual.level] ?? actual.level;
};

/** 폭 없는 공백(U+200B)을 떼고 공백을 하나로 줄인다. 멘션은 여기서 건드리지 않는다. */
export const normalize = (text: string) =>
  text.replace(/​/gu, "").replace(/\s+/gu, " ").trim();

export const hasMention = (text: string) => /^@\S/u.test(normalize(text));

/**
 * 저장된 원문이 어느 항목인지 찾는다.
 *
 * 유튜브 멘션은 띄어쓰기가 있을 때도 없을 때도 있다. 실제 수집 데이터에
 * `@ancommons261 전공샹` 과 `@ee-tc7lk직접` 이 함께 있었다. 그래서 앞을 잘라내는
 * 대신 **뒤에서 맞춘다.** 기대 문구로 끝나면 그 항목이다.
 */
export const matches = (stored: string, expected: string) => {
  const a = normalize(stored);
  const b = normalize(expected);
  if (a === b) return true;
  if (!a.startsWith("@")) return false;
  return a.endsWith(b);
};

const expectedOf = (entry: TestEntry, afterSlang: boolean): Expected =>
  afterSlang ? (entry.expectedAfterSlang ?? entry.expected) : entry.expected;

/**
 * 맞았는지 세는 규칙.
 *
 * `open` 은 정답을 두지 않은 것이라 세지 않는다. `skip` 은 「들어오지 않아야 한다」는
 * 뜻이므로 없는 것이 맞은 것이다 — 여기만 반대로 읽어야 한다.
 *
 * 유튜브가 지운 것(🚫)은 우리 판단을 거치지 않았으므로 맞고 틀림에서 뺀다.
 */
const judge = (entry: TestEntry, expected: Expected, actual: Actual) => {
  if (entry.removedByYouTube) return "🚫" as const;
  if (expected === "open") return "—" as const;
  if (expected === "skip") return actual.kind === "missing" ? "✅" : "❌";
  if (actual.kind === "missing") return "⛔" as const;
  if (actual.status === "review_queue" || actual.level === null) return "⏸" as const;
  return actual.level === expected ? ("✅" as const) : ("❌" as const);
};

const main = async () => {
  loadEnvFile();

  const args = process.argv.slice(2);
  const afterSlang = args.includes("--after-slang");
  const groups = args.filter((arg) => !arg.startsWith("--")).map((arg) => arg.toUpperCase());

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: rows, error } = await supabase
    .from("raw_comments")
    .select(
      "id, text_display, parent_youtube_comment_id, youtube_comment_id, classification_verdicts(level, status, feedback_core, created_at)",
    )
    .order("captured_at", { ascending: false })
    .limit(2000);

  if (error) throw error;

  const all = rows ?? [];
  const byYoutubeId = new Map(all.map((row) => [row.youtube_comment_id, row]));

  const entries = VLOG_TEST_SET.filter(
    (entry) => groups.length === 0 || groups.includes(GROUP_OF(entry.id)),
  );

  const cache = new Map<string, Actual>();

  const resolve = (entry: TestEntry): Actual => {
    const cached = cache.get(entry.id);
    if (cached) return cached;

    // 긴 문구가 짧은 문구를 품는 일이 있다. 가장 짧게 맞는 것이 그 항목이다.
    const candidates = all
      .filter((row) => matches(row.text_display, entry.text))
      .sort((a, b) => normalize(a.text_display).length - normalize(b.text_display).length);
    const row = candidates[0];

    if (!row) {
      const miss: Actual = { kind: "missing" };
      cache.set(entry.id, miss);
      return miss;
    }

    const latest = [...(row.classification_verdicts ?? [])].sort((a, b) =>
      a.created_at < b.created_at ? 1 : -1,
    )[0];
    const parent = row.parent_youtube_comment_id
      ? byYoutubeId.get(row.parent_youtube_comment_id)
      : undefined;

    const found: Actual = {
      kind: "found",
      level: latest?.level ?? null,
      status: latest?.status ?? "pending",
      hasMention: hasMention(row.text_display),
      parentText: parent ? parent.text_display.slice(0, 22) : null,
      feedbackCore: latest?.feedback_core ?? null,
      rewritten: null,
    };
    cache.set(entry.id, found);
    return found;
  };

  let group = "";
  let hit = 0;
  let counted = 0;

  console.log(
    afterSlang
      ? "\n기준: 은어 등록 후 기대\n"
      : "\n기준: 은어 목록이 빈 첫 판\n",
  );

  for (const entry of entries) {
    const current = GROUP_OF(entry.id);
    if (current !== group) {
      group = current;
      console.log(`\n── ${group}  ${GROUP_NOTE[group] ?? ""}`);
    }

    const actual = resolve(entry);
    const expected = expectedOf(entry, afterSlang);
    const mark = judge(entry, expected, actual);
    if (mark === "✅" || mark === "❌") {
      counted += 1;
      if (mark === "✅") hit += 1;
    }

    const parentNote =
      entry.parentId && actual.kind === "found"
        ? `  부모「${actual.parentText ?? "없음"}」`
        : "";
    const mentionNote =
      actual.kind === "found" && actual.hasMention !== Boolean(entry.mention)
        ? entry.mention
          ? "  ⚠@칩이 없다"
          : "  ⚠@칩이 남아 있다"
        : "";

    console.log(
      `${mark} ${entry.id}  ${LABEL[expected]} → ${levelLabel(actual)}  ${entry.text.slice(0, 30)}${parentNote}${mentionNote}`,
    );
  }

  console.log(`\n맞음 ${hit} / 센 것 ${counted}  (정답 없는 것과 보류는 세지 않음)\n`);

  const missing = entries.filter(
    (entry) =>
      !entry.removedByYouTube &&
      expectedOf(entry, afterSlang) !== "skip" &&
      resolve(entry).kind === "missing",
  );
  if (missing.length > 0) {
    console.log(
      `들어오지 않은 댓글 ${missing.length}개: ${missing.map((entry) => entry.id).join(" ")}`,
    );
    console.log("유튜브가 보류했는지, 원문을 고쳐 달았는지 확인한다.\n");
  }
};

// 테스트가 이 파일을 불러올 때 DB 를 건드리지 않도록, 직접 실행일 때만 돈다.
if (process.argv[1]?.endsWith("report-vlog-run.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
