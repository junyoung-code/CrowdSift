import { zodTextFormat } from "openai/helpers/zod";

import { ClassificationSchemaError, type ResponsesClient } from "./luna-first-pass";
import {
  TERRA_VERIFICATION_PROMPT,
  TERRA_VERIFICATION_PROMPT_VERSION,
} from "./prompts";
import { TerraVerdictSchema, type TerraVerdict } from "./schemas";
import type { SecondPassInput } from "./contracts";
import type { ModelRun } from "./contracts";

/**
 * 모델에게 보내는 사용자 메시지.
 *
 * **Luna 의 판단이 들어가지 않는다.** 후보 등급도, 확신도도, 왜 넘어왔는지도 넣지
 * 않는다. 앞선 답을 보여주면 모델이 거기에 끌려가고, 그러면 "두 판단이 갈렸다" 가
 * 정보가 되지 못한다.
 *
 * 모더레이션 결과는 넣는다. 그것은 판단이 아니라 사실이다.
 */
const toModelInput = (input: SecondPassInput) => ({
  comment: input.sourceText,
  videoTitle: input.videoTitle,
  // 부모 원문은 1차 판단이 아니라 이 댓글이 무엇에 답하는지를 알려주는 사실이다.
  parent: input.parent ? { text: input.parent.text } : null,
  profile: input.profile,
  similarExamples: input.similarExamples.map((example) => ({
    text: example.text,
    level: example.level,
    note: example.note,
  })),
  moderation: input.moderation
    ? {
        flagged: input.moderation.flagged,
        categories: [
          ...input.moderation.categories,
          ...input.moderation.unknownCategories,
        ],
      }
    : null,
});

/**
 * 3. Terra 2차 검증.
 *
 * 최종 등급을 정하지 않는다. 자기 판단만 내고, 확정은 verdict.ts 가 두 판단과
 * 모더레이션 정책을 함께 읽어서 한다.
 */
export const createTerraVerification = ({
  client,
  model,
}: {
  client: ResponsesClient;
  model: string;
}) => ({
  promptVersion: TERRA_VERIFICATION_PROMPT_VERSION,

  async verify(
    input: SecondPassInput,
  ): Promise<{ result: TerraVerdict; run: ModelRun }> {
    const startedAt = Date.now();
    const response = await client.responses.parse({
      model,
      // 1차와 달리 판단 과정을 거치게 한다. 기획서가 요구하는 "1차와 하나 이상
      // 다르게" 를 모델과 추론 설정 두 곳에서 만족한다.
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: TERRA_VERIFICATION_PROMPT },
        { role: "user", content: JSON.stringify(toModelInput(input)) },
      ],
      text: {
        format: zodTextFormat(TerraVerdictSchema, "terra_verdict"),
      },
    });

    if (response.output_parsed === null) {
      throw new ClassificationSchemaError("Terra returned no parsed output");
    }

    const parsed = TerraVerdictSchema.safeParse(response.output_parsed);

    if (!parsed.success) {
      throw new ClassificationSchemaError(
        "Terra output did not match the verdict schema",
        { cause: parsed.error },
      );
    }

    return {
      result: parsed.data,
      run: {
        model: response.model ?? model,
        responseId: response.id,
        latencyMs: Date.now() - startedAt,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
      },
    };
  },
});

export type TerraVerification = ReturnType<typeof createTerraVerification>;
