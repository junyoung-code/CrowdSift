/**
 * 옮겨 적은 폭력과 진짜 위협을 Terra 가 가르는지 겨냥해서 본다.
 *
 * 편드는 사람이 악플을 옮겨 적었다는 이유로 묻히는 문제를 고치면서,
 * 진짜 협박까지 같이 풀려 버리지 않았는지 확인하는 것이 목적이다.
 * 그래서 고쳐야 할 문장과 절대 흔들리면 안 되는 문장을 같은 표에 둔다.
 */
import OpenAI from "openai";

import { createTerraVerification } from "../src/features/classification/terra-verification";
import { TERRA_VERIFICATION_PROMPT_VERSION } from "../src/features/classification/prompts";
import { DEFAULT_CLASSIFICATION_PROFILE, type RiskLevel } from "../src/features/classification/schemas";
import { loadEnvFile, section } from "./test-comments";

type Probe = {
  text: string;
  expected: RiskLevel;
  note: string;
};

const probes: Probe[] = [
  {
    text: "한국인의 가장 안좋은 특징입니다. 실수 한번 하면 다같이 모여서 도를 넘게 마녀사냥하고 죽여버리는 것. 유노님 굴하지 말고 멘탈 쎄게 다잡고 조금만 버티세요. 실수는 누구나 할 수 있고 사과하셨으면 된겁니다.",
    expected: "safe",
    note: "실제로 위험으로 묻혔던 응원 댓글",
  },
  {
    text: "댓글마다 죽으라고 하는 사람들 진짜 너무하네요",
    expected: "safe",
    note: "악플을 옮겨 적으며 나무람",
  },
  {
    text: "저런 말 하는 사람들은 좀 자제했으면 좋겠어요. 인신공격이 너무 심해요",
    expected: "safe",
    note: "악플러를 말리는 말",
  },
  {
    text: "너 진짜 죽여버린다",
    expected: "danger",
    note: "직접 위협 · 절대 흔들리면 안 됨",
  },
  {
    text: "다음에 직접 찾아간다ㅋㅋ 어디 사는지 안다",
    expected: "danger",
    note: "웃음 붙은 스토킹 위협 · 절대 흔들리면 안 됨",
  },
  {
    text: "가족들까지 다 알아냈으니까 각오해라",
    expected: "danger",
    note: "가족 겨냥 협박 · 절대 흔들리면 안 됨",
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

  section(`Terra 겨냥 확인 · ${TERRA_VERIFICATION_PROMPT_VERSION} · ${model}`);

  // 경계에 걸린 문장은 한 번 맞았다고 고쳐진 것이 아니다. 반복 횟수를 받는다.
  const repeats = Number(process.argv[3] ?? "1");
  const only = process.argv[2];
  const selected = only
    ? probes.filter((probe) => probe.text.startsWith(only))
    : probes;

  let matched = 0;

  for (const probe of Array.from({ length: repeats }, () => selected).flat()) {
    const { result } = await terra.verify({
      commentId: "probe",
      workspaceId: "probe",
      sourceText: probe.text,
      videoTitle: "사과드립니다.",
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
    console.log(`     ${probe.text.slice(0, 62)}`);
    console.log(`     ${probe.note}`);
    if (!ok) {
      console.log(`     사유: ${result.reasonCodes.join(", ") || "(없음)"}`);
      console.log(`     강한신호: ${result.hardRiskFlags.join(", ") || "(없음)"}`);
      console.log(`     약한신호: ${result.softRiskFlags.join(", ") || "(없음)"}`);
    }
    console.log("");
  }

  console.log(`일치 ${matched}/${selected.length * repeats}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
