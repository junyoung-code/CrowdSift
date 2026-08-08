import type {
  FirstPassInput,
  FirstPassResult,
  ModelRun,
  ParentComment,
  SecondPassInput,
  SimilarExample,
} from "./contracts";
import type { BranchOutcome } from "./branch";
import { routeFirstPass } from "./branch";
import {
  finalizeClassification,
  type FinalClassificationVerdict,
} from "./finalize";
import type {
  ClassificationProfile,
  FeedbackType,
  ReasonCode,
  TerraVerdict,
} from "./schemas";

export type ClassificationWorkItem = {
  id: string;
  workspaceId: string;
  rawCommentId: string;
  sourceText: string;
  videoTitle: string;
  channelId: string;
  policyVersion: number;
  profile: ClassificationProfile;
  similarExamples: SimilarExample[];
  parent: ParentComment | null;
};

export type StoredTerraResult = {
  result: TerraVerdict;
  run: ModelRun;
  promptVersion: string;
};

export type StoredFinalVerdict = {
  verdict: FinalClassificationVerdict;
  reasonCodes: ReasonCode[];
  feedbackType: FeedbackType;
  feedbackCore: string | null;
};

export type StoredClassificationState = {
  firstPass: FirstPassResult | null;
  branch: BranchOutcome | null;
  terra: StoredTerraResult | null;
  verdict: StoredFinalVerdict | null;
};

export type ClassificationJobProgress = {
  status:
    | "pending"
    | "running"
    | "partially_succeeded"
    | "succeeded"
    | "failed";
  total: number;
  completed: number;
  failed: number;
  remaining: number;
};

export interface ClassificationJobRepository {
  claimItems(jobId: string, maxItems: number): Promise<ClassificationWorkItem[]>;
  loadState(item: ClassificationWorkItem): Promise<StoredClassificationState>;
  saveFirstPass(
    item: ClassificationWorkItem,
    result: FirstPassResult,
  ): Promise<void>;
  saveBranch(item: ClassificationWorkItem, branch: BranchOutcome): Promise<void>;
  saveTerra(
    item: ClassificationWorkItem,
    result: StoredTerraResult,
  ): Promise<void>;
  saveVerdict(
    item: ClassificationWorkItem,
    result: StoredFinalVerdict,
  ): Promise<void>;
  completeItem(itemId: string): Promise<void>;
  failItem(itemId: string, errorCode: string): Promise<void>;
  refreshJobProgress(jobId: string): Promise<ClassificationJobProgress>;
}

type FirstPassRunner = {
  run(input: FirstPassInput): Promise<FirstPassResult>;
};

type SecondPassRunner = {
  promptVersion?: string;
  verify(input: SecondPassInput): Promise<{
    result: TerraVerdict;
    run: ModelRun;
  }>;
};

const toFirstPassInput = (item: ClassificationWorkItem): FirstPassInput => ({
  commentId: item.rawCommentId,
  workspaceId: item.workspaceId,
  sourceText: item.sourceText,
  videoTitle: item.videoTitle,
  channelId: item.channelId,
  profile: item.profile,
  similarExamples: item.similarExamples,
  parent: item.parent,
});

const toSecondPassInput = (
  item: ClassificationWorkItem,
  firstPass: FirstPassResult,
): SecondPassInput => ({
  commentId: item.rawCommentId,
  workspaceId: item.workspaceId,
  sourceText: item.sourceText,
  videoTitle: item.videoTitle,
  channelId: item.channelId,
  profile: item.profile,
  similarExamples: item.similarExamples,
  parent: item.parent,
  moderation: firstPass.moderation?.result ?? null,
});

export const createClassificationService = ({
  firstPass,
  repository,
  secondPass,
}: {
  firstPass: FirstPassRunner;
  secondPass: SecondPassRunner;
  repository: ClassificationJobRepository;
}) => ({
  async processChunk(
    jobId: string,
    maxItems: number,
  ): Promise<ClassificationJobProgress> {
    const items = await repository.claimItems(jobId, maxItems);

    for (const item of items) {
      try {
        const stored = await repository.loadState(item);

        if (stored.verdict) {
          await repository.completeItem(item.id);
          continue;
        }

        const first =
          stored.firstPass ?? (await firstPass.run(toFirstPassInput(item)));
        if (!stored.firstPass) {
          await repository.saveFirstPass(item, first);
        }

        const branch = stored.branch ?? routeFirstPass(first);
        if (!stored.branch) {
          await repository.saveBranch(item, branch);
        }

        let terra = stored.terra;
        if (branch.kind === "verify" && !terra) {
          const verified = await secondPass.verify(toSecondPassInput(item, first));
          terra = {
            ...verified,
            promptVersion: secondPass.promptVersion ?? "terra-v1",
          };
          await repository.saveTerra(item, terra);
        }

        const verdict = finalizeClassification({
          firstPass: first,
          branch,
          terra: terra?.result ?? null,
        });
        const finalResult: StoredFinalVerdict = {
          verdict,
          reasonCodes: terra?.result.reasonCodes ?? [],
          feedbackType: terra?.result.feedbackType ?? "none",
          feedbackCore: terra?.result.feedbackCore ?? null,
        };
        await repository.saveVerdict(item, finalResult);
        await repository.completeItem(item.id);
      } catch {
        await repository.failItem(item.id, "classification_failed");
      }
    }

    return repository.refreshJobProgress(jobId);
  },
});
