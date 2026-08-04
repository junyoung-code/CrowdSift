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
