/**
 * 사생활 참견을 공격으로 읽는지, 그리고 **따뜻한 말까지 함께 잡지는 않는지** 본다.
 *
 * 14차에서 드러난 것: Terra 가 오지랖을 조언으로 읽는다. 「이제 결혼할 나이 아니에요?」
 * 「부모님이 걱정하시겠어요」를 안전이라 했다. 기준은 사생활 참견을 공격으로 본다.
 * 지금까지는 Luna 가 위험이라 해서 `danger_in_either` 가 가려 주고 있었을 뿐이다.
 *
 * 고치면서 「피곤해 보이시는데 좀 쉬세요」까지 위험으로 가면 아무것도 얻지 못한다.
 * 이 둘은 겉모양이 거의 같다 — 걱정하는 말투에 상대를 위하는 내용이다. 그래서 올라가야
 * 할 문장과 **절대 올라가면 안 되는 문장**을 같은 표에 둔다.
 *
 *   npx tsx scripts/probe-private-life-meddling.ts        한 바퀴
 *   npx tsx scripts/probe-private-life-meddling.ts "" 3   세 바퀴
 */
import OpenAI from "openai";

import { TERRA_VERIFICATION_PROMPT_VERSION } from "../src/features/classification/prompts";
import {
  DEFAULT_CLASSIFICATION_PROFILE,
  type RiskLevel,
} from "../src/features/classification/schemas";
import { createTerraVerification } from "../src/features/classification/terra-verification";
import { loadEnvFile, section } from "./test-comments";

type Probe = { text: string; expected: RiskLevel; note: string };

const probes: Probe[] = [
  {
    text: "이제 결혼할 나이 아니에요?",
    expected: "danger",
    note: "실제로 안전으로 읽던 참견",
  },
  {
    text: "부모님이 걱정하시겠어요",
    expected: "danger",
    note: "실제로 안전으로 읽던 참견. 가족을 빌려 삶을 평가한다",
  },
  {
    text: "자취 그만하고 집 들어가지 그래요",
    expected: "danger",
    note: "주거를 고치라는 말",
  },
  {
    text: "돈 좀 아껴 쓰세요 배달만 시키지 말고",
    expected: "danger",
    note: "돈 씀씀이를 고치라는 말. 13차부터 혼자 주의로 갈렸다",
  },
  {
    // 겉으로는 걱정이고 문장도 부드럽다. 그래서 참견인지 가리기 가장 어렵다.
    text: "피곤해 보이시는데 좀 쉬세요",
    expected: "safe",
    note: "영상에 보인 것에 대한 반응 · 절대 올라가면 안 됨",
  },
  {
    text: "감기 조심하세요",
    expected: "safe",
    note: "그냥 인사 · 절대 올라가면 안 됨",
  },
  {
    text: "자취 몇 년차세요?",
    expected: "safe",
    note: "답을 알고 싶어 하는 물음 · 물음표만으로 참견이 되면 안 된다",
  },
  {
    text: "자막 너무 작아서 폰으로 안 보임 좀 키워주세요",
    expected: "safe",
    note: "콘텐츠 요청 · 「~세요」 말투 때문에 올라가면 안 된다",
  },
  {
    text: "신경 쓰지 마세요 저런 사람들 어디에나 있어요",
    expected: "safe",
    note: "크리에이터를 편드는 말 · 절대 올라가면 안 됨",
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

  section(`사생활 참견 겨냥 확인 · ${TERRA_VERIFICATION_PROMPT_VERSION} · ${model}`);

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
      videoTitle: "자취방 대청소 + 베란다 정리 브이로그",
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
      console.log(
        `     신호: ${[...result.hardRiskFlags, ...result.softRiskFlags].join(", ") || "(없음)"}`,
      );
    }
    console.log("");
  }

  console.log(`일치 ${matched}/${selected.length * repeats}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
