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
import type { RewriteInput } from "./luna-rewrite";
import { detectSpam } from "./spam-rules";
import {
  finalizeClassification,
  type FinalClassificationVerdict,
} from "./finalize";
import type { RewriteInspection } from "./rewrite-guard";
import type {
  ClassificationProfile,
  FeedbackType,
  ReasonCode,
  Rewrite,
  TerraVerdict,
} from "./schemas";
import { toClassificationFailureCode } from "./classification-errors";

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
  /**
   * 이 댓글을 어떻게 가져왔는지.
   *
   * 공개 URL 로 살펴본 댓글에는 개인화를 쓰지 않는다. 제품 규칙이다 — 남의 영상을
   * 들여다본 결과에 이 채널의 기준을 얹으면, 우리 것이 아닌 것에 우리 판단을
   * 새기는 셈이 된다.
   *
   * 비워 두면 개인화를 켜지 않는다. 빠뜨렸을 때 조용히 켜지는 것보다 낫다.
   */
  sourceKind?: "owned_oauth" | "public_url";
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

export type StoredRewrite = {
  result: Rewrite;
  inspection: RewriteInspection;
  run: ModelRun;
  promptVersion: string;
};

export type StoredClassificationState = {
  firstPass: FirstPassResult | null;
  branch: BranchOutcome | null;
  terra: StoredTerraResult | null;
  verdict: StoredFinalVerdict | null;
  rewrite: StoredRewrite | null;
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
  /** 같은 말투가 줄줄이 이어지지 않도록 최근 순화문을 돌려준다. */
  loadRecentRewrites(item: ClassificationWorkItem): Promise<string[]>;
  saveRewrite(
    item: ClassificationWorkItem,
    result: StoredRewrite,
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

export type PersonalizationLookup = {
  retrieve(input: {
    workspaceId: string;
    text: string;
  }): Promise<SimilarExample[]>;
};

type RewriteRunner = {
  promptVersion?: string;
  rewrite(input: RewriteInput): Promise<{
    result: Rewrite;
    inspection: RewriteInspection;
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
  personalization,
  repository,
  rewrite,
  secondPass,
}: {
  firstPass: FirstPassRunner;
  secondPass: SecondPassRunner;
  rewrite: RewriteRunner;
  repository: ClassificationJobRepository;
  /**
   * 이 채널에서 사람이 이미 정한 비슷한 판단을 찾아 온다. 없으면 개인화 없이 돈다.
   */
  personalization?: PersonalizationLookup;
}) => {
  /**
   * 유사 사례를 붙인다. 붙지 않아도 판단은 계속한다.
   *
   * 개인화는 판단에 얹는 것이지 판단의 조건이 아니다. 검색이 실패했다고 댓글을
   * 분류하지 못하면, 부가 기능 하나가 제품 전체를 멈춰 세우게 된다.
   */
  const withSimilarExamples = async (
    item: ClassificationWorkItem,
  ): Promise<ClassificationWorkItem> => {
    if (!personalization) return item;
    // 명시적으로 소유 채널인 것만. 비어 있으면 켜지 않는다.
    if (item.sourceKind !== "owned_oauth") return item;

    try {
      const similarExamples = await personalization.retrieve({
        workspaceId: item.workspaceId,
        text: item.sourceText,
      });
      return { ...item, similarExamples };
    } catch {
      return item;
    }
  };

  /**
   * 주의로 확정되고 보존할 의견이 있을 때만 순화문을 만든다.
   *
   * 순화는 판정에 얹는 것이지 판정의 일부가 아니다. 여기서 실패해도 이미 저장된
   * 판정은 그대로 두고 항목을 성공으로 끝낸다. 화면은 순화문이 없으면
   * 피드백 핵심을 대신 보여준다.
   */
  const ensureRewrite = async (
    item: ClassificationWorkItem,
    final: StoredFinalVerdict,
    existing: StoredRewrite | null,
  ) => {
    if (existing) return;
    if (!final.verdict.allowRewrite) return;
    if (!final.feedbackCore) return;

    try {
      const produced = await rewrite.rewrite({
        commentId: item.rawCommentId,
        sourceText: item.sourceText,
        feedbackCore: final.feedbackCore,
        profile: item.profile,
        recentRewrites: await repository.loadRecentRewrites(item),
      });
      await repository.saveRewrite(item, {
        ...produced,
        promptVersion: rewrite.promptVersion ?? "luna-rewrite-v1",
      });
    } catch {
      // 순화문 없이 간다.
    }
  };

  return {
  async processChunk(
    jobId: string,
    maxItems: number,
  ): Promise<ClassificationJobProgress> {
    const items = await repository.claimItems(jobId, maxItems);

    for (const claimed of items) {
      let item = claimed;
      try {
        const stored = await repository.loadState(item);

        if (stored.verdict) {
          // 판정을 저장한 뒤 끊겼다면 순화문만 비어 있을 수 있다.
          await ensureRewrite(item, stored.verdict, stored.rewrite);
          await repository.completeItem(item.id);
          continue;
        }

        // 이미 1차를 마친 항목은 다시 찾지 않는다. 그때 쓴 사례가 남아 있다.
        if (!stored.firstPass) {
          item = await withSimilarExamples(item);
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
          // 스팸은 아무도 공격하지 않아 등급 기준에 걸리지 않는다. 코드가 본다.
          spam: detectSpam(item.sourceText),
          terra: terra?.result ?? null,
        });
        const finalResult: StoredFinalVerdict = {
          verdict,
          reasonCodes: terra?.result.reasonCodes ?? [],
          feedbackType: terra?.result.feedbackType ?? "none",
          feedbackCore: terra?.result.feedbackCore ?? null,
        };
        await repository.saveVerdict(item, finalResult);
        await ensureRewrite(item, finalResult, null);
        await repository.completeItem(item.id);
      } catch (error) {
        await repository.failItem(item.id, toClassificationFailureCode(error));
      }
    }

    return repository.refreshJobProgress(jobId);
  },
  };
};
