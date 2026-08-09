import { z } from "zod";

import type { ChannelCommentProvider } from "@/features/youtube/channel-comment-contracts";

import {
  type ChannelSyncClaim,
  type ChannelSyncRepository,
  type ChannelSyncVideoImportJob,
  type CompleteChannelVideoImportInput,
} from "./channel-comment-sync-service";
import { mapProviderComment, type ProviderComment } from "./comment-mapper";
import {
  ChannelSyncProcessingError,
  toChannelSyncProcessingError,
} from "./import-errors";

const PARENT_BATCH_SIZE = 20;

const ReplyCursorSchema = z.object({
  publishedAt: z.iso.datetime(),
  id: z.uuid(),
});

export type ReplyCursor = z.infer<typeof ReplyCursorSchema>;

export const encodeReplyCursor = (cursor: ReplyCursor): string =>
  Buffer.from(
    JSON.stringify(ReplyCursorSchema.parse(cursor)),
    "utf8",
  ).toString("base64url");

export const decodeReplyCursor = (value: string): ReplyCursor => {
  try {
    return ReplyCursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
  } catch (error) {
    throw new ChannelSyncProcessingError("invalid_reply_cursor", {
      cause: error,
    });
  }
};

export type ReplyReconciliationParent = {
  rawCommentId: string;
  youtubeCommentId: string;
  youtubeVideoId: string;
  publishedAt: string;
};

type ReplyCounts = {
  storedCount: number;
  updatedCount: number;
  duplicateCount: number;
  failedCount: number;
};

const emptyCounts = (): ReplyCounts => ({
  storedCount: 0,
  updatedCount: 0,
  duplicateCount: 0,
  failedCount: 0,
});

const importStatus = (
  counts: ReplyCounts,
): CompleteChannelVideoImportInput["status"] => {
  if (counts.failedCount === 0) return "succeeded";
  if (
    counts.storedCount + counts.updatedCount + counts.duplicateCount >
    0
  ) {
    return "partially_succeeded";
  }
  return "failed";
};

type ReplyRepositoryBase = Pick<
  ChannelSyncRepository,
  | "createOrGetVideoImportJob"
  | "storeComment"
  | "recordFailedItem"
  | "completeVideoImportJob"
  | "attachRecoverableAnalysisItems"
  | "failRun"
>;

export interface ReplyReconciliationRepository extends ReplyRepositoryBase {
  listParents(input: {
    workspaceId: string;
    youtubeChannelId: string;
    publishedAfter: string;
    cursor: ReplyCursor | null;
    limit: 20;
  }): Promise<{
    items: ReplyReconciliationParent[];
    nextCursor: ReplyCursor | null;
  }>;
  completeRun(input: {
    runId: string;
    claimToken: string;
    replyCursor: string | null;
    observedCount: number;
    storedCount: number;
    updatedCount: number;
    duplicateCount: number;
    failedCount: number;
    analyzedCount: number;
    quotaUnitsUsed: number;
  }): Promise<void>;
}

export type ReplyReconciliationSource = Pick<
  ChannelCommentProvider,
  "listReplies"
>;

export type ReplyReconciliationBatchResult = {
  runId: string;
  importJobIds: string[];
  analysisJobIds: string[];
  nextCursor: string | null;
  observedCount: number;
  storedCount: number;
  updatedCount: number;
  duplicateCount: number;
  failedCount: number;
  analyzedCount: number;
  quotaUnitsUsed: number;
};

const collectParentReplies = async ({
  parentYoutubeCommentId,
  source,
}: {
  parentYoutubeCommentId: string;
  source: ReplyReconciliationSource;
}): Promise<{ comments: ProviderComment[]; quotaUnitsUsed: number }> => {
  const comments = new Map<string, ProviderComment>();
  const seenPageTokens = new Set<string>();
  let pageToken: string | undefined;
  let quotaUnitsUsed = 0;

  while (true) {
    const page = await source.listReplies({
      parentYoutubeCommentId,
      maxResults: 100,
      pageToken,
    });
    quotaUnitsUsed += page.quotaUnitsUsed;

    for (const reply of page.items) {
      if (!comments.has(reply.id)) {
        comments.set(reply.id, {
          ...reply,
          parentId: parentYoutubeCommentId,
        });
      }
    }

    const nextPageToken = page.nextPageToken ?? undefined;
    if (!nextPageToken || seenPageTokens.has(nextPageToken)) {
      break;
    }
    seenPageTokens.add(nextPageToken);
    pageToken = nextPageToken;
  }

  return { comments: [...comments.values()], quotaUnitsUsed };
};

const groupParentsByVideo = (parents: ReplyReconciliationParent[]) => {
  const groups = new Map<string, ReplyReconciliationParent[]>();
  for (const parent of parents) {
    const group = groups.get(parent.youtubeVideoId) ?? [];
    group.push(parent);
    groups.set(parent.youtubeVideoId, group);
  }
  return groups;
};

const addTerminalSnapshot = ({
  analyzedCount,
  importJob,
  quotaUnitsUsed,
  totals,
}: {
  importJob: Extract<ChannelSyncVideoImportJob, { state: "terminal" }>;
  totals: ReplyCounts;
  analyzedCount: number;
  quotaUnitsUsed: number;
}) => {
  totals.storedCount += importJob.storedCount;
  totals.updatedCount += importJob.updatedCount;
  totals.duplicateCount += importJob.duplicateCount;
  totals.failedCount += importJob.failedCount;
  return {
    analyzedCount: analyzedCount + importJob.analyzedCount,
    quotaUnitsUsed: quotaUnitsUsed + importJob.quotaUnitsUsed,
  };
};

export const createReplyReconciliationService = ({
  analysisConfigurationKey,
  providerMode,
  repository,
  source,
}: {
  repository: ReplyReconciliationRepository;
  source: ReplyReconciliationSource;
  analysisConfigurationKey: string;
  providerMode: "live" | "fixture";
}) => ({
  async process(
    claim: ChannelSyncClaim,
  ): Promise<ReplyReconciliationBatchResult> {
    try {
      if (claim.runKind !== "reply_reconciliation") {
        throw new ChannelSyncProcessingError("unsupported_sync_kind");
      }

      const cursor = claim.pageToken
        ? decodeReplyCursor(claim.pageToken)
        : null;
      const parentPage = await repository.listParents({
        workspaceId: claim.workspaceId,
        youtubeChannelId: claim.youtubeChannelId,
        publishedAfter: claim.backfillStartAt,
        cursor,
        limit: PARENT_BATCH_SIZE,
      });
      const totals = emptyCounts();
      const importJobIds: string[] = [];
      const analysisJobIds: string[] = [];
      let analyzedCount = 0;
      let quotaUnitsUsed = 0;

      for (const [youtubeVideoId, parents] of groupParentsByVideo(
        parentPage.items,
      )) {
        const importJob = await repository.createOrGetVideoImportJob({
          runId: claim.runId,
          claimToken: claim.claimToken,
          workspaceId: claim.workspaceId,
          youtubeVideoId,
          providerMode,
        });
        importJobIds.push(importJob.id);

        if (importJob.state === "terminal") {
          ({ analyzedCount, quotaUnitsUsed } = addTerminalSnapshot({
            importJob,
            totals,
            analyzedCount,
            quotaUnitsUsed,
          }));
          continue;
        }

        const videoReplies = new Map<string, ProviderComment>();
        let videoQuotaUnitsUsed = 0;
        for (const parent of parents) {
          const collected = await collectParentReplies({
            parentYoutubeCommentId: parent.youtubeCommentId,
            source,
          });
          videoQuotaUnitsUsed += collected.quotaUnitsUsed;
          for (const reply of collected.comments) {
            if (!videoReplies.has(reply.id)) {
              videoReplies.set(reply.id, reply);
            }
          }
        }

        const counts = emptyCounts();
        for (const providerReply of videoReplies.values()) {
          const sourceComment = mapProviderComment(providerReply);
          try {
            const stored = await repository.storeComment({
              importJobId: importJob.id,
              runId: claim.runId,
              claimToken: claim.claimToken,
              workspaceId: claim.workspaceId,
              youtubeVideoId,
              comment: sourceComment,
            });
            counts[`${stored.disposition}Count`] += 1;
          } catch {
            counts.failedCount += 1;
            try {
              await repository.recordFailedItem({
                importJobId: importJob.id,
                runId: claim.runId,
                claimToken: claim.claimToken,
                workspaceId: claim.workspaceId,
                youtubeCommentId: sourceComment.youtubeCommentId,
                errorCode: "source_store_failed",
              });
            } catch {
              // Durable totals retain the failure if its detail row cannot be written.
            }
          }
        }

        await repository.completeVideoImportJob({
          importJobId: importJob.id,
          runId: claim.runId,
          claimToken: claim.claimToken,
          observedCount: videoReplies.size,
          ...counts,
          topLevelCount: 0,
          replyCount: videoReplies.size,
          quotaUnitsUsed: videoQuotaUnitsUsed,
          errorCode: null,
          status: importStatus(counts),
        });

        const attachment = await repository.attachRecoverableAnalysisItems({
          importJobId: importJob.id,
          runId: claim.runId,
          claimToken: claim.claimToken,
          workspaceId: claim.workspaceId,
          youtubeVideoId,
          configurationKey: analysisConfigurationKey,
        });
        if (attachment.analysisJobId) {
          analysisJobIds.push(attachment.analysisJobId);
        }

        totals.storedCount += counts.storedCount;
        totals.updatedCount += counts.updatedCount;
        totals.duplicateCount += counts.duplicateCount;
        totals.failedCount += counts.failedCount;
        analyzedCount +=
          importJob.analyzedCount + attachment.attachedRawCommentIds.length;
        quotaUnitsUsed += videoQuotaUnitsUsed;
      }

      const nextCursor = parentPage.nextCursor
        ? encodeReplyCursor(parentPage.nextCursor)
        : null;
      const completion = {
        runId: claim.runId,
        claimToken: claim.claimToken,
        replyCursor: nextCursor,
        observedCount:
          totals.storedCount +
          totals.updatedCount +
          totals.duplicateCount +
          totals.failedCount,
        ...totals,
        analyzedCount,
        quotaUnitsUsed,
      };
      await repository.completeRun(completion);

      return {
        runId: completion.runId,
        importJobIds,
        analysisJobIds,
        nextCursor,
        observedCount: completion.observedCount,
        storedCount: completion.storedCount,
        updatedCount: completion.updatedCount,
        duplicateCount: completion.duplicateCount,
        failedCount: completion.failedCount,
        analyzedCount: completion.analyzedCount,
        quotaUnitsUsed: completion.quotaUnitsUsed,
      };
    } catch (error) {
      const processingError = toChannelSyncProcessingError(error);
      await repository.failRun({
        runId: claim.runId,
        claimToken: claim.claimToken,
        errorCode: processingError.code,
      });
      throw processingError;
    }
  },
});
