import { createHash } from "node:crypto";

export type AnalysisIdempotencyInput = {
  rawCommentId: string;
  policyVersion: number;
  promptVersion: string;
  modelVersion: string;
  schemaVersion: string;
};

export const buildAnalysisIdempotencyKey = (
  input: AnalysisIdempotencyInput,
) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        rawCommentId: input.rawCommentId,
        policyVersion: input.policyVersion,
        promptVersion: input.promptVersion,
        modelVersion: input.modelVersion,
        schemaVersion: input.schemaVersion,
      }),
    )
    .digest("hex");
