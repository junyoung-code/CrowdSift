/**
 * 비교로 칭찬하는 말을 외모 공격으로 읽는지 겨냥해서 본다.
 *
 * 실제 판정에서 「화장 안 하신 게 훨씬 나아요」와 「카메라 각도 때문인지 실물이 더
 * 나으실 듯」이 둘 다 위험으로 갔다. 팬의 칭찬이 협박과 같은 칸에 들어간 것이다.
 *
 * 고치면서 진짜 외모 공격까지 함께 풀리면 아무것도 얻지 못한다. 그래서 내려가야 할
 * 문장과 **절대 흔들리면 안 되는 문장**을 같은 표에 둔다.
 *
 *   npx tsx scripts/probe-comparative-praise.ts          한 바퀴
 *   npx tsx scripts/probe-comparative-praise.ts "" 3     세 바퀴 (경계는 한 번으로 못 믿는다)
 */
import OpenAI from "openai";

import { createTerraVerification } from "../src/features/classification/terra-verification";
import { TERRA_VERIFICATION_PROMPT_VERSION } from "../src/features/classification/prompts";
import {
  DEFAULT_CLASSIFICATION_PROFILE,
  type RiskLevel,
} from "../src/features/classification/schemas";
import { loadEnvFile, section } from "./test-comments";

type Probe = { text: string; expected: RiskLevel; note: string };

const probes: Probe[] = [
  {
    text: "화장 안 하신 게 훨씬 나아요",
    expected: "safe",
    note: "실제로 위험으로 갔던 칭찬",
  },
  {
    text: "카메라 각도 때문인지 실물이 더 나으실 듯",
    expected: "safe",
    note: "실제로 위험으로 갔던 칭찬",
  },
  {
    text: "예전 편집보다 지금이 훨씬 좋아요",
    expected: "safe",
    note: "사람이 아니라 편집을 비교",
  },
  {
    text: "썸네일보다 영상이 백배 낫네요",
    expected: "safe",
    note: "같은 형태. 깎는 대상이 사람이 아님",
  },
  {
    text: "요즘 살찌셨네요",
    expected: "danger",
    note: "외모 지적 · 절대 흔들리면 안 됨",
  },
  {
    text: "얼굴이 왜 이렇게 삭았어요",
    expected: "danger",
    note: "외모 공격 · 절대 흔들리면 안 됨",
  },
  {
    // 처음에는 「예전이 훨씬 나았는데 지금은 왜 이래요」로 두었는데, 무엇이
    // 나빠졌다는 것인지 적혀 있지 않아 콘텐츠 비판으로 읽어도 맞는 문장이었다.
    // 통제군은 한 가지로만 읽혀야 한다.
    text: "예전 얼굴이 훨씬 나았는데 지금은 왜 이래요",
    expected: "danger",
    note: "비교가 크리에이터의 외모를 낮춤 · 흔들리면 안 됨",
  },
  {
    text: "어디 사는지 다 알아냈다 조심해라",
    expected: "danger",
    note: "스토킹 위협 · 절대 흔들리면 안 됨",
  },
];

const label: Record<RiskLevel, string> = {
  safe: "🟢 안전",
  caution: "🟡 주의",
  danger: "🔴 위험",
};

const main = async () => {
  loadEnvFile();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 가 없다");

  const model = process.env.OPENAI_TERRA_MODEL ?? "gpt-5.6-terra";
  const terra = createTerraVerification({
    client: new OpenAI({ apiKey }) as never,
    model,
  });

  section(`비교 칭찬 겨냥 확인 · ${TERRA_VERIFICATION_PROMPT_VERSION} · ${model}`);

  const only = process.argv[2];
  const repeats = Number(process.argv[3] ?? "1");
  const selected = only
    ? probes.filter((probe) => probe.text.startsWith(only))
    : probes;

  let matched = 0;

  for (const probe of Array.from({ length: repeats }, () => selected).flat()) {
    const { result } = await terra.verify({
      commentId: "probe",
      workspaceId: "probe",
      sourceText: probe.text,
      videoTitle: "퇴근하고 30분, 자취 4년차 냉장고 털이",
      channelId: "probe-channel",
      profile: DEFAULT_CLASSIFICATION_PROFILE,
      similarExamples: [],
      parent: null,
      moderation: null,
    });

    const ok = result.verdictLevel === probe.expected;
    if (ok) matched += 1;

    console.log(
      `${ok ? "  " : "❌"} ${label[result.verdictLevel]}  (기대 ${label[probe.expected]})  ${result.certainty}`,
    );
    console.log(`     ${probe.text}`);
    console.log(`     ${probe.note}`);
    if (!ok) {
      console.log(`     사유: ${result.reasonCodes.join(", ") || "(없음)"}`);
    }
    console.log("");
  }

  console.log(`일치 ${matched}/${selected.length * repeats}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
