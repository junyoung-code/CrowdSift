import type {
  CommentCategory,
  RecommendedAction,
  ReviewLevel,
} from "@/features/analysis/contracts";
import { EmbeddingSchemaError } from "@/features/analysis/rag-service";

export type CreatorCorrection = {
  workspaceId: string;
  actorUserId: string;
  rawCommentId: string;
  analysisId: string;
  sourceImportJobId: string;
  decision: "approved" | "rejected" | "corrected";
  correctedCategory: CommentCategory | null;
  correctedReviewLevel: ReviewLevel | null;
  correctedRecommendedAction: RecommendedAction | null;
  editedSanitizedFeedback: string | null;
  useForPersonalization: boolean;
  useForTraining: boolean;
};

export interface FeedbackRepository {
  loadOwnedContext(input: {
    workspaceId: string;
    rawCommentId: string;
    analysisId: string;
    sourceImportJobId: string;
  }): Promise<{
    sourceText: string;
    sourceKind: "owned_oauth" | "public_url";
    sourceImportJobId: string;
  }>;
  insertFeedback(input: CreatorCorrection): Promise<string>;
  insertEmbedding(input: {
    workspaceId: string;
    feedbackId: string;
    vector: number[];
    model: string;
  }): Promise<void>;
}

/**
 * 이 교정을 나중에 무엇으로 찾을 것인지.
 *
 * **댓글 원문만 넣는다.** 검색하는 쪽(`rag-service`)이 새 댓글의 원문을 임베딩해
 * 비교하므로, 저장하는 쪽도 같은 모양이어야 코사인 거리가 뜻을 갖는다.
 *
 * 처음에는 교정 내용까지 JSON 으로 묶어 임베딩했다. 맨 문장과 JSON 덩어리를 견주는
 * 셈이라 임계값 0.78 을 넘길 일이 거의 없다. 한 번도 돌려본 적이 없어 드러나지 않았다.
 *
 * 교정 내용은 임베딩에 넣지 않아도 잃지 않는다. 검색이 돌려주는 행에 그대로 실려 있다.
 */
const buildRetrievalKey = (sourceText: string) => sourceText.replaceAll("\n", " ");

export class PublicSourceReadOnlyError extends Error {
  readonly code = "PUBLIC_SOURCE_READ_ONLY";

  constructor() {
    super("Public-source comments are read-only");
  }
}

export const saveCreatorCorrection = async (
  input: CreatorCorrection,
  {
    embeddingProvider,
    repository,
  }: {
    repository: FeedbackRepository;
    embeddingProvider: {
      embed(text: string): Promise<{ vector: number[]; model: string }>;
    };
  },
) => {
  const context = await repository.loadOwnedContext({
    workspaceId: input.workspaceId,
    rawCommentId: input.rawCommentId,
    analysisId: input.analysisId,
    sourceImportJobId: input.sourceImportJobId,
  });

  if (
    context.sourceImportJobId !== input.sourceImportJobId
  ) {
    throw new Error("SOURCE_OBSERVATION_MISMATCH");
  }
  if (
    context.sourceKind === "public_url" &&
    (input.useForPersonalization || input.useForTraining)
  ) {
    throw new PublicSourceReadOnlyError();
  }

  if (!input.useForPersonalization) {
    return repository.insertFeedback(input);
  }

  const embedding = await embeddingProvider.embed(
    buildRetrievalKey(context.sourceText),
  );
  if (embedding.vector.length !== 1536) {
    throw new EmbeddingSchemaError(
      "Creator feedback embedding must contain 1536 dimensions",
    );
  }

  const feedbackId = await repository.insertFeedback(input);
  await repository.insertEmbedding({
    workspaceId: input.workspaceId,
    feedbackId,
    vector: embedding.vector,
    model: embedding.model,
  });

  return feedbackId;
};
