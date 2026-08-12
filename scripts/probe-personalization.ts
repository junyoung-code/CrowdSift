/**
 * 개인화가 실제로 도는지 왕복으로 본다. 심고, **다른 문장으로** 찾고, 지운다.
 *
 * 같은 문장으로 찾으면 유사도가 1.0 이 나와 아무것도 증명하지 못한다. 그래서 가르친
 * 문장과 찾는 문장을 다르게 두고, **붙어야 할 짝과 절대 붙으면 안 될 짝**을 같은 표에
 * 놓는다. 임계값은 그 사이 어디에 두는지의 문제이므로 두 무리를 함께 보아야 한다.
 *
 *   npx tsx scripts/probe-personalization.ts
 *   npx tsx scripts/probe-personalization.ts --keep    심은 교정을 남긴다
 *
 * 임계값을 넘겼는지가 아니라 **실제 거리**를 찍는다. 「안 걸렸다」만 보면 임계값이
 * 높은 것인지 배선이 끊긴 것인지 구분할 수 없다.
 */
import { createClient } from "@supabase/supabase-js";

import { createOpenAIEmbedding } from "../src/features/classification/openai-embedding";
import { createPersonalizationLookup } from "../src/features/classification/personalization-lookup";
import { saveCreatorCorrection } from "../src/features/feedback/feedback-service";
import { createSupabaseFeedbackRepository } from "../src/features/feedback/supabase-feedback-repository";
import { loadEnvFile, section } from "./test-comments";

/** 「이 채널에서는 칭찬이다」로 고쳐 둘 댓글들. 전부 주의 → 안전. */
const TEACH = ["개맛있겠다 진짜", "미쳤다 저 계란찜", "편집 쌉가능이네요"];

/**
 * 찾아볼 문장들.
 *
 * 처음에는 「같은 종류의 은어니까 붙어야 한다」로 적었다가 두 무리가 겹쳤다. 그것이
 * 검색이 하는 일이 아니었다. 임베딩은 **주제가 가까운 것**을 찾는다. 「자막이 작다」와
 * 「편집 쌉가능이네요」가 0.357 로 붙은 것은 둘 다 영상 제작 얘기라서지 판정이 같아서가
 * 아니고, 「존나 부럽다」가 0.291 로 먼 것은 가르친 셋 중 주제가 겹치는 것이 없어서다.
 *
 * 그래서 기대를 검색이 실제로 할 수 있는 것에 맞춘다.
 *   near  거의 같은 말. 이것도 못 찾으면 검색이 고장 난 것이다
 *   far   그 밖의 전부. 종류가 같아도 다른 말이면 붙지 않는 것이 맞다
 *
 * 표현 단위의 규칙(「우리 채널에서 개-는 칭찬」)은 `allowedSlang` 이 맡는다. 그쪽은
 * 주제를 타지 않으므로 이 두 길은 겹치지 않고 나뉜다.
 */
const PROBES: { text: string; kind: "near" | "far" }[] = [
  { text: "개같이 맛있겠다", kind: "near" },
  { text: "저 계란찜 미쳤다", kind: "near" },
  { text: "존나 부럽다 자취 이렇게 하고 싶다", kind: "far" },
  { text: "ㄹㅇ 이게 자취요리지", kind: "far" },
  { text: "어디 사는지 다 알아냈다 조심해라", kind: "far" },
  { text: "이제 결혼할 나이 아니에요?", kind: "far" },
  { text: "자막 너무 작아서 폰으로 안 보임 좀 키워주세요", kind: "far" },
  { text: "요즘 살찌셨네요", kind: "far" },
];

const main = async () => {
  loadEnvFile();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const embedding = createOpenAIEmbedding({
    apiKey: process.env.OPENAI_API_KEY!,
    model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
  });

  section("개인화 왕복 확인");
  console.log(`  임베딩 ${embedding.model}`);

  const { data: actor } = await supabase
    .from("workspace_members")
    .select("user_id, workspace_id")
    .limit(1)
    .maybeSingle();
  if (!actor) throw new Error("워크스페이스 구성원을 찾지 못했다");
  const workspaceId = actor.workspace_id;

  const repository = createSupabaseFeedbackRepository({
    supabase: supabase as never,
  });
  const planted: string[] = [];

  console.log("\n1. 교정 저장 — 주의로 잡힌 은어를 안전으로");
  for (const text of TEACH) {
    // 하드코딩한 id 를 쓰지 않는다. 다른 사람의 개발 DB 에서도 돌아야 한다.
    const { data: comment } = await supabase
      .from("raw_comments")
      .select(
        "id, workspace_id, classification_verdicts(id, created_at), comment_import_items(import_job_id)",
      )
      .eq("text_display", text)
      .eq("workspace_id", workspaceId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const verdict = [...(comment?.classification_verdicts ?? [])].sort((a, b) =>
      a.created_at < b.created_at ? 1 : -1,
    )[0];
    const importJobId = comment?.comment_import_items?.[0]?.import_job_id;
    if (!comment || !verdict || !importJobId) {
      console.log(`   ⛔ ${text} — 판정이나 가져오기 기록이 없어 건너뛴다`);
      continue;
    }

    const feedbackId = await saveCreatorCorrection(
      {
        workspaceId,
        actorUserId: actor.user_id,
        rawCommentId: comment.id,
        analysisId: verdict.id,
        sourceImportJobId: importJobId,
        decision: "corrected",
        correctedCategory: null,
        correctedReviewLevel: "safe",
        correctedRecommendedAction: null,
        editedSanitizedFeedback: null,
        useForPersonalization: true,
        useForTraining: false,
      },
      { repository, embeddingProvider: embedding },
    );
    planted.push(feedbackId);
    console.log(`   ✅ ${text}`);
  }

  if (planted.length === 0) throw new Error("아무것도 심지 못했다");

  const { count } = await supabase
    .from("feedback_embeddings")
    .select("id", { count: "exact", head: true })
    .in("classification_feedback_id", planted);
  console.log(`   임베딩 ${count}행`);

  // 임계값 0 으로 열어 두고 실제 거리를 본다. 문턱은 그 숫자를 보고 정한다.
  const lookup = createPersonalizationLookup({
    rpc: supabase.rpc.bind(supabase) as never,
    embedding,
    threshold: 0,
    limit: 5,
  });

  console.log("\n2. 가장 가까운 사례와의 거리\n");
  const best: { kind: "near" | "far"; similarity: number; text: string }[] = [];

  for (const probe of PROBES) {
    const examples = await lookup.retrieve({ workspaceId, text: probe.text });
    const top = examples[0];
    best.push({
      kind: probe.kind,
      similarity: top?.similarity ?? 0,
      text: probe.text,
    });
    console.log(
      `   ${probe.kind === "near" ? "붙어야" : "떨어져야"}  ` +
        `${(top?.similarity ?? 0).toFixed(3)}  "${probe.text}"` +
        (top ? `\n              가장 가까운 사례: "${top.text}"` : ""),
    );
  }

  const nearLow = Math.min(
    ...best.filter((row) => row.kind === "near").map((row) => row.similarity),
  );
  const farHigh = Math.max(
    ...best.filter((row) => row.kind === "far").map((row) => row.similarity),
  );

  console.log("\n3. 문턱을 어디에 둘 수 있나\n");
  console.log(`   붙어야 하는 것 중 가장 먼 것   ${nearLow.toFixed(3)}`);
  console.log(`   떨어져야 하는 것 중 가장 가까운 것 ${farHigh.toFixed(3)}`);
  console.log(
    nearLow > farHigh
      ? `   → 두 무리가 갈린다. 문턱은 ${farHigh.toFixed(3)} 과 ${nearLow.toFixed(3)} 사이.`
      : "   → 두 무리가 겹친다. 문턱만으로는 가를 수 없다.",
  );

  if (process.argv.includes("--keep")) {
    console.log("\n4. --keep · 심어 둔 교정을 남긴다\n");
    return;
  }

  console.log("\n4. 정리");
  await supabase.from("classification_feedback").delete().in("id", planted);
  const { count: after } = await supabase
    .from("feedback_embeddings")
    .select("id", { count: "exact", head: true })
    .in("classification_feedback_id", planted);
  console.log(`   남은 임베딩 ${after}행 — cascade 로 함께 지워져야 한다\n`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
