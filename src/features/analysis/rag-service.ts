import type {
  CommentCategory,
  EmbeddingResult,
  RetrievedFeedback,
  ReviewLevel,
} from "./contracts";

export class EmbeddingSchemaError extends Error {
  readonly code = "EMBEDDING_SCHEMA_INVALID";
}

export type CreatorFeedbackSearchRow = {
  workspaceId: string;
  feedbackId: string;
  similarity: number;
  decision: "approved" | "rejected" | "corrected";
  correctedCategory: CommentCategory | null;
  correctedReviewLevel: ReviewLevel | null;
  editedSanitizedFeedback: string | null;
};

export interface CreatorFeedbackSearchRepository {
  search(input: {
    workspaceId: string;
    vector: number[];
    threshold: number;
    limit: number;
  }): Promise<CreatorFeedbackSearchRow[]>;
}

export const createRagService = ({
  embeddingProvider,
  repository,
}: {
  embeddingProvider: {
    embed(text: string): Promise<EmbeddingResult>;
  };
  repository: CreatorFeedbackSearchRepository;
}) => {
  const retrieveWithUsage = async ({
    limit = 5,
    text,
    threshold = 0.78,
    workspaceId,
  }: {
    workspaceId: string;
    text: string;
    threshold?: number;
    limit?: number;
  }): Promise<{
    examples: RetrievedFeedback[];
    embeddingUsage: {
      inputTokens: number;
      model: string;
    };
  }> => {
    const normalizedText = text.replaceAll("\n", " ");
    const embedding = await embeddingProvider.embed(normalizedText);

    if (embedding.vector.length !== 1536) {
      throw new EmbeddingSchemaError(
        "Creator feedback embedding must contain 1536 dimensions",
      );
    }

    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 5);
    const rows = await repository.search({
      workspaceId,
      vector: embedding.vector,
      threshold,
      limit: boundedLimit,
    });

    if (rows.some((row) => row.workspaceId !== workspaceId)) {
      throw new Error("rag_workspace_scope_mismatch");
    }

    const examples = rows
      .filter((row) => row.similarity >= threshold)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, boundedLimit)
      .map((row) => ({
        feedbackId: row.feedbackId,
        similarity: row.similarity,
        decision: row.decision,
        correctedCategory: row.correctedCategory,
        correctedReviewLevel: row.correctedReviewLevel,
        editedSanitizedFeedback: row.editedSanitizedFeedback,
      }));

    return {
      examples,
      embeddingUsage: {
        inputTokens: embedding.usage.inputTokens,
        model: embedding.model,
      },
    };
  };

  return {
    retrieveCreatorExamplesWithUsage: retrieveWithUsage,
    async retrieveCreatorExamples(
      input: Parameters<typeof retrieveWithUsage>[0],
    ): Promise<RetrievedFeedback[]> {
      return (await retrieveWithUsage(input)).examples;
    },
  };
};
