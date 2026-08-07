import { zodTextFormat } from "openai/helpers/zod";

import type { ModelRun } from "./contracts";
import {
  ClassificationSchemaError,
  type ResponsesClient,
} from "./luna-first-pass";
import { LUNA_REWRITE_PROMPT, LUNA_REWRITE_PROMPT_VERSION } from "./prompts";
import { inspectRewrite, type RewriteInspection } from "./rewrite-guard";
import { RewriteSchema, type ClassificationProfile, type Rewrite } from "./schemas";

export type RewriteInput = {
  commentId: string;
  /** 원문. 불편의 강도를 가늠하는 데만 쓰인다. */
  sourceText: string;
  /** Terra 가 뽑아 둔 의견. 순화문의 내용은 여기서 나온다. */
  feedbackCore: string;
  profile: ClassificationProfile;
  /** 최근에 만든 순화문들. 같은 말투가 줄줄이 이어지지 않게 한다. */
  recentRewrites: string[];
};

const toModelInput = (input: RewriteInput) => ({
  sourceText: input.sourceText,
  feedbackCore: input.feedbackCore,
  profile: {
    rewriteTone: input.profile.rewriteTone,
    emojiFrequency: input.profile.emojiFrequency,
  },
  // 몇 개만 보여준다. 길어지면 그대로 베끼기 시작한다.
  recentRewrites: input.recentRewrites.slice(-5),
});

/**
 * 4. 주의 댓글 순화.
 *
 * 언제 부를지는 코드가 정한다. 최종 등급이 주의이고 순화할 재료가 있을 때만 부르므로,
 * 여기서 "만들어도 되는지" 는 다시 묻지 않는다.
 *
 * 만든 문장을 그대로 내보내지 않는다. 검사를 통과하지 못하면 순화문 없이 간다.
 */
export const createLunaRewrite = ({
  client,
  model,
}: {
  client: ResponsesClient;
  model: string;
}) => ({
  promptVersion: LUNA_REWRITE_PROMPT_VERSION,

  async rewrite(input: RewriteInput): Promise<{
    result: Rewrite;
    inspection: RewriteInspection;
    run: ModelRun;
  }> {
    const startedAt = Date.now();
    const response = await client.responses.parse({
      model,
      // 앞서 만든 순화문과 겹치지 않게 쓰려면 그 목록을 훑어보는 단계가 필요하다.
      // effort 가 none 이면 가장 그럴듯한 표현을 바로 내놓아 같은 어미가 반복된다.
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: LUNA_REWRITE_PROMPT },
        { role: "user", content: JSON.stringify(toModelInput(input)) },
      ],
      text: { format: zodTextFormat(RewriteSchema, "luna_rewrite") },
    });

    if (response.output_parsed === null) {
      throw new ClassificationSchemaError("Luna returned no rewrite");
    }

    const parsed = RewriteSchema.safeParse(response.output_parsed);

    if (!parsed.success) {
      throw new ClassificationSchemaError(
        "Luna rewrite did not match the schema",
        { cause: parsed.error },
      );
    }

    return {
      result: parsed.data,
      inspection: inspectRewrite({
        rewrite: parsed.data,
        sourceText: input.sourceText,
      }),
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

export type LunaRewrite = ReturnType<typeof createLunaRewrite>;
