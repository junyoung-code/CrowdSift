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
    creatorFeedbackId: string;
    vector: number[];
    model: string;
  }): Promise<void>;
}

const buildRetrievalDocument = (
  input: CreatorCorrection,
  sourceText: string,
) =>
  JSON.stringify({
    sourceComment: sourceText,
    creatorDecision: input.decision,
    correctedCategory: input.correctedCategory,
    correctedReviewLevel: input.correctedReviewLevel,
    correctedRecommendedAction: input.correctedRecommendedAction,
    editedSanitizedFeedback: input.editedSanitizedFeedback,
  });

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
    buildRetrievalDocument(input, context.sourceText),
  );
  if (embedding.vector.length !== 1536) {
    throw new EmbeddingSchemaError(
      "Creator feedback embedding must contain 1536 dimensions",
    );
  }

  const feedbackId = await repository.insertFeedback(input);
  await repository.insertEmbedding({
    workspaceId: input.workspaceId,
    creatorFeedbackId: feedbackId,
    vector: embedding.vector,
    model: embedding.model,
  });

  return feedbackId;
};
