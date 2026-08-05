import type {
  ClassificationProfile,
  LunaFirstPass,
  ModerationResult,
} from "./schemas";

/**
 * 채널에서 이미 확정된 유사 사례. 1-B 프롬프트에 예시로 들어간다.
 * 검색 결과만으로 등급을 결정하지는 않는다.
 */
export type SimilarExample = {
  text: string;
  level: LunaFirstPass["candidateLevel"];
  similarity: number;
  note: string | null;
};

export type FirstPassInput = {
  commentId: string;
  workspaceId: string;
  sourceText: string;
  videoTitle: string;
  channelId: string;
  profile: ClassificationProfile;
  similarExamples: SimilarExample[];
};

/**
 * 3단계 Terra 입력.
 *
 * FirstPassInput 과 거의 같지만 **Luna 의 판단이 빠져 있다.** 그 자리에 모더레이션
 * 결과가 들어간다. 무엇이 들어가지 않는지가 이 타입의 요점이므로 FirstPassInput 을
 * 확장하지 않고 따로 적는다.
 */
export type SecondPassInput = {
  commentId: string;
  workspaceId: string;
  sourceText: string;
  videoTitle: string;
  channelId: string;
  profile: ClassificationProfile;
  similarExamples: SimilarExample[];
  /** 무료 필터가 본 사실. 부르지 못했으면 null 이다. */
  moderation: ModerationResult | null;
};

export type ModelRun = {
  model: string;
  responseId: string;
  latencyMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

/**
 * 1단계 산출물. 두 갈래의 답을 합치지 않고 나란히 보관한다.
 * 합치는 일은 2번 분기가 한다.
 */
export type FirstPassResult = {
  commentId: string;
  workspaceId: string;
  moderation: {
    result: ModerationResult;
    model: string;
    latencyMs: number;
  } | null;
  luna: {
    result: LunaFirstPass;
    run: ModelRun;
  };
  promptVersion: string;
  evaluatedAt: string;
};
