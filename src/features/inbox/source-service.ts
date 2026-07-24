export type CommentSource = {
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  publishedAt: string | null;
  textDisplay: string;
  capturedAt: string;
};

export interface SourceRepository {
  findOwnedSource(input: {
    workspaceId: string;
    commentId: string;
  }): Promise<CommentSource | null>;
}

export class SourceAcknowledgementError extends Error {
  readonly code = "SOURCE_ACKNOWLEDGEMENT_REQUIRED";
}

export class SourceNotFoundError extends Error {
  readonly code = "SOURCE_NOT_FOUND";
}

export const loadAcknowledgedSource = async (
  input: {
    workspaceId: string;
    commentId: string;
    acknowledged: boolean;
  },
  repository: SourceRepository,
) => {
  if (!input.acknowledged) {
    throw new SourceAcknowledgementError(
      "The source warning must be acknowledged",
    );
  }

  const source = await repository.findOwnedSource({
    workspaceId: input.workspaceId,
    commentId: input.commentId,
  });
  if (!source) {
    throw new SourceNotFoundError("Comment source was not found");
  }

  return source;
};
