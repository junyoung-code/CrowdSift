import OpenAI from "openai";

/**
 * 개인화 검색이 쓰는 임베딩.
 *
 * `openai-analysis-provider` 에도 같은 호출이 있지만 그쪽은 옛 파이프라인의
 * 1·2단계 모델까지 설정돼 있어야 만들어진다. 댓글 한 줄을 벡터로 바꾸는 데 쓰지 않는
 * 모델 이름 두 개를 요구할 이유가 없어 여기서 따로 둔다.
 *
 * 쓰는 쪽과 읽는 쪽이 **같은 모델**을 써야 한다. 모델이 다르면 벡터 공간이 달라
 * 거리가 뜻을 잃는다. 그래서 모델 이름을 결과에 함께 실어 저장한다.
 *
 * **설정을 스스로 읽지 않는다.** `@/lib/env` 는 `server-only` 를 물고 있어, 그것을
 * 여기서 가져오면 이 모듈이 서버 밖에서는 불러올 수조차 없게 된다. 측정 스크립트가
 * 같은 임베딩을 쓸 수 있어야 쓰는 쪽과 읽는 쪽이 어긋나지 않는다.
 */
export type EmbeddingResult = {
  vector: number[];
  model: string;
  usage: { inputTokens: number };
};

export const createOpenAIEmbedding = ({
  apiKey,
  model,
}: {
  apiKey: string;
  model: string;
}) => {
  if (!model || !apiKey) {
    throw new Error("embedding_configuration_required");
  }

  const client = new OpenAI({ apiKey });

  return {
    model,
    async embed(text: string): Promise<EmbeddingResult> {
      const response = await client.embeddings.create({
        model,
        input: text,
        encoding_format: "float",
      });
      const vector = response.data[0]?.embedding;

      if (!vector) {
        throw new Error("embedding_response_empty");
      }

      return {
        vector,
        model,
        usage: { inputTokens: response.usage?.prompt_tokens ?? 0 },
      };
    },
  };
};
