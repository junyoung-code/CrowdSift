import type { SimilarExample } from "./contracts";
import type { PersonalizationLookup } from "./classification-service";
import type { RiskLevel } from "./schemas";

/**
 * 이 채널에서 사람이 이미 정한 판단 중 비슷한 것을 찾아 준다.
 *
 * 검색 결과는 **참고 자료로만** 넘어간다. 프롬프트가 「유사 사례만으로 등급을 결정하지
 * 않는다. 판단 순서가 항상 우선한다」고 못 박고 있고, 협박·스토킹 같은 신호는
 * 어떤 사례로도 완화되지 않는다.
 */

/** DB 는 위험을 `risk` 라 하고 모델은 `danger` 라 한다. */
const toRiskLevel = (level: string): RiskLevel | null => {
  if (level === "risk") return "danger";
  if (level === "safe" || level === "caution") return level;
  return null;
};

type MatchRow = {
  feedback_id: string;
  similarity: number;
  decision: string;
  source_text: string;
  corrected_review_level: string | null;
  edited_sanitized_feedback: string | null;
};

type MatchRpc = (
  name: "match_classification_feedback",
  input: {
    target_workspace_id: string;
    query_embedding: string;
    match_threshold: number;
    match_count: number;
  },
) => PromiseLike<{ data: MatchRow[] | null; error: { message?: string } | null }>;

export const createPersonalizationLookup = ({
  embedding,
  limit = 3,
  rpc,
  threshold = 0.5,
}: {
  rpc: MatchRpc;
  embedding: { embed(text: string): Promise<{ vector: number[] }> };
  /**
   * 몇 건까지 붙일지.
   *
   * 다섯까지 받을 수 있지만 셋으로 둔다. 사례가 길어질수록 판단 순서보다 사례가
   * 눈에 먼저 들어오고, 그러면 기준이 사례에 끌려간다.
   */
  limit?: number;
  /**
   * 이만큼 가까운 것만 사례로 삼는다.
   *
   * 물려받은 값은 0.78 이었는데 그 문턱으로는 **아무것도 걸리지 않았다.** 긴 영어
   * 문서에 맞는 값이고 짧은 한국어 댓글에는 맞지 않는다. `scripts/probe-personalization.ts`
   * 로 재보면 이렇다.
   *
   *   0.817  「저 계란찜 미쳤다」   ← 「미쳤다 저 계란찜」
   *   0.601  「개같이 맛있겠다」    ← 「개맛있겠다 진짜」
   *   0.357  「자막이 작다」        ← 「편집 쌉가능이네요」   붙으면 안 되는 것 중 최고
   *
   * 0.357 과 0.601 사이가 비어 있어 그 가운데에 둔다.
   *
   * **거의 같은 말만 걸린다.** 종류가 같아도 다른 말이면 붙지 않는다 — 「존나 부럽다」는
   * 0.291 로 떨어진다. 그것을 노리는 것이 아니다. 임베딩은 주제가 가까운 것을 찾을 뿐,
   * 「이 표현은 우리 채널에서 칭찬」 같은 규칙은 담지 못한다. 그쪽은 `allowedSlang` 이
   * 맡는다. 둘은 겹치지 않고 나뉜다.
   */
  threshold?: number;
}): PersonalizationLookup => ({
  async retrieve({ text, workspaceId }): Promise<SimilarExample[]> {
    const trimmed = text.replaceAll("\n", " ").trim();
    if (trimmed.length === 0) return [];

    const { vector } = await embedding.embed(trimmed);
    if (vector.length !== 1536) {
      throw new Error("embedding_dimension_mismatch");
    }

    const { data, error } = await rpc("match_classification_feedback", {
      target_workspace_id: workspaceId,
      query_embedding: `[${vector.join(",")}]`,
      match_threshold: threshold,
      match_count: Math.min(Math.max(limit, 1), 5),
    });
    if (error) throw new Error(error.message ?? "personalization_search_failed");

    return (data ?? [])
      .map((row) => {
        const level = row.corrected_review_level
          ? toRiskLevel(row.corrected_review_level)
          : null;
        if (!level) return null;

        return {
          text: row.source_text,
          level,
          similarity: row.similarity,
          // 사람이 남긴 말이 있으면 그것이 가장 좋은 설명이다. 없으면 비워 둔다.
          note: row.edited_sanitized_feedback,
        } satisfies SimilarExample;
      })
      .filter((example): example is SimilarExample => example !== null);
  },
});
