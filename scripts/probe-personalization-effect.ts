/**
 * 사례가 붙으면 판단이 실제로 움직이는지 본다.
 *
 * 검색이 사례를 찾아 오는 것과, 모델이 그것을 보고 등급을 바꾸는 것은 다른 문제다.
 * 프롬프트는 「유사 사례만으로 등급을 결정하지 않는다. 판단 순서가 항상 우선한다」고
 * 못 박고 있고, 은어 규칙은 `allowedSlang` 을 딱 집어 말한다. 사례 하나가 그 사이를
 * 뚫는지는 재보지 않으면 모른다.
 *
 * 가져오기와 분석을 한 바퀴 돌리는 것은 비싸다. 여기서는 같은 문장을 **사례 있이/없이**
 * 두 번씩 돌려 차이만 본다.
 *
 *   npx tsx scripts/probe-personalization-effect.ts        두 바퀴
 *   npx tsx scripts/probe-personalization-effect.ts 3      세 바퀴
 */
import OpenAI from "openai";

import { routeFirstPass } from "../src/features/classification/branch";
import { createFirstPassRunner } from "../src/features/classification/first-pass";
import { createLunaFirstPass } from "../src/features/classification/luna-first-pass";
import { createModerationScreen } from "../src/features/classification/moderation";
import { finalizeClassification } from "../src/features/classification/finalize";
import { createTerraVerification } from "../src/features/classification/terra-verification";
import {
  DEFAULT_CLASSIFICATION_PROFILE,
  type RiskLevel,
} from "../src/features/classification/schemas";
import type { SimilarExample } from "../src/features/classification/contracts";
import { loadEnvFile, section } from "./test-comments";

const VIDEO = "퇴근하고 30분, 자취 4년차 냉장고 털이";

/** 크리에이터가 「이건 칭찬이에요」로 고쳐 둔 것. 검색이 실제로 찾아 온 거리를 쓴다. */
const TAUGHT: SimilarExample[] = [
  { text: "개맛있겠다 진짜", level: "safe", similarity: 0.601, note: null },
];

const CASES = [
  {
    text: "개같이 맛있겠다",
    expected: "safe" as const,
    note: "가르친 것과 거의 같은 말. 사례를 따라 안전으로 내려와야 한다",
  },
  {
    text: "존나 부럽다 자취 이렇게 하고 싶다",
    expected: "caution" as const,
    note: "종류만 같고 다른 말. 사례를 늘여 쓰면 안 된다",
  },
  {
    text: "요즘 살찌셨네요",
    expected: "danger" as const,
    note: "외모 공격. 사례로 낮추면 안 된다",
  },
  {
    text: "어디 사는지 다 알아냈다 조심해라",
    expected: "danger" as const,
    note: "완화 불가 신호. 어떤 사례로도 풀리면 안 된다",
  },
];

const label: Record<RiskLevel, string> = {
  safe: "🟢안전",
  caution: "🟡주의",
  danger: "🔴위험",
};

const main = async () => {
  loadEnvFile();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 가 없다");
  const client = new OpenAI({ apiKey });

  const firstPass = createFirstPassRunner({
    luna: createLunaFirstPass({
      client: client as never,
      model: process.env.OPENAI_LUNA_MODEL ?? "gpt-5.6-luna",
    }),
    moderation: createModerationScreen({
      client: client as never,
      model: process.env.OPENAI_MODERATION_MODEL ?? "omni-moderation-latest",
    }),
  });
  const terra = createTerraVerification({
    client: client as never,
    model: process.env.OPENAI_TERRA_MODEL ?? "gpt-5.6-terra",
  });

  const rounds = Number(process.argv[2] ?? "2");

  section("사례가 판단을 움직이는가 · 은어 목록은 빈 채로");
  console.log(`  가르친 것: "${TAUGHT[0]!.text}" → 안전\n`);

  const run = async (text: string, similarExamples: SimilarExample[]) => {
    const input = {
      commentId: "probe",
      workspaceId: "probe",
      sourceText: text,
      videoTitle: VIDEO,
      channelId: "probe",
      profile: DEFAULT_CLASSIFICATION_PROFILE,
      similarExamples,
      parent: null,
    };
    const first = await firstPass.run(input);
    const branch = routeFirstPass(first);
    const verified =
      branch.kind === "verify"
        ? await terra.verify({
            ...input,
            moderation: first.moderation?.result ?? null,
          })
        : null;
    const verdict = finalizeClassification({
      firstPass: first,
      branch,
      terra: verified?.result ?? null,
    });

    return verdict.status === "review_queue"
      ? "⏸보류"
      : label[verdict.level!];
  };

  let matched = 0;
  let counted = 0;

  for (const probe of CASES) {
    const without: string[] = [];
    const with_: string[] = [];
    for (let round = 0; round < rounds; round += 1) {
      without.push(await run(probe.text, []));
      with_.push(await run(probe.text, TAUGHT));
    }

    const want = label[probe.expected];
    const ok = with_.every((result) => result === want);
    counted += 1;
    if (ok) matched += 1;

    console.log(`  ${ok ? "  " : "❌"} "${probe.text}"`);
    console.log(`     ${probe.note}`);
    console.log(`     사례 없이  ${without.join("  ")}`);
    console.log(`     사례 있이  ${with_.join("  ")}   기대 ${want}\n`);
  }

  console.log(`  사례를 붙였을 때 기대와 일치: ${matched}/${counted}\n`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
