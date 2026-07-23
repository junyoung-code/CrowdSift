import { z } from "zod";

import { CommentCategorySchema, ReviewLevelSchema } from "@/features/analysis/schemas";

import type {
  DashboardRepository,
  DashboardSnapshot,
  JobSummary,
} from "./dashboard-query";

const ChannelSummarySchema = z.object({
  youtubeChannelId: z.string(),
  title: z.string(),
  handle: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
});

const VideoSummarySchema = z.object({
  youtubeVideoId: z.string(),
  title: z.string(),
  thumbnailUrl: z.string().nullable(),
  publishedAt: z.string().nullable(),
});

const ImportJobSchema = z.object({
  id: z.string(),
  status: z.string(),
  requestedTopLevelCount: z.number().int().nonnegative(),
  storedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});

const AnalysisJobSchema = z.object({
  id: z.string(),
  status: z.string(),
  totalCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});

const PriorityCommentSchema = z.object({
  rawCommentId: z.string(),
  reviewLevel: z.enum(["caution", "risk"]),
  category: CommentCategorySchema,
  sanitizedText: z.string().nullable(),
});

const FeedbackSummarySchema = z.object({
  id: z.string(),
  decision: z.string(),
  correctedReviewLevel: ReviewLevelSchema.nullable(),
  editedSanitizedFeedback: z.string().nullable(),
  createdAt: z.string(),
});

const ActionSummarySchema = z.object({
  id: z.string(),
  action: z.string(),
  state: z.string(),
  createdAt: z.string(),
});

const DashboardRpcRowSchema = z.object({
  imported_count: z.number().int().nonnegative(),
  analyzed_count: z.number().int().nonnegative(),
  safe_count: z.number().int().nonnegative(),
  caution_count: z.number().int().nonnegative(),
  risk_count: z.number().int().nonnegative(),
  pending_review_count: z.number().int().nonnegative(),
  selected_channel: ChannelSummarySchema.nullable(),
  latest_video: VideoSummarySchema.nullable(),
  latest_import_job: ImportJobSchema.nullable(),
  latest_analysis_job: AnalysisJobSchema.nullable(),
  priority_comments: z.array(PriorityCommentSchema),
  recent_corrections: z.array(FeedbackSummarySchema),
  recent_actions: z.array(ActionSummarySchema),
  latest_summary: z.string().nullable(),
  latest_summary_source_count: z.number().int().nonnegative().nullable(),
});

type DashboardRpc = (
  name: "get_dashboard_summary",
  input: { target_workspace_id: string },
) => PromiseLike<{
  data: unknown;
  error: { message?: string } | null;
}>;

const mapImportJob = (
  job: z.infer<typeof ImportJobSchema> | null,
): JobSummary | null =>
  job
    ? {
        id: job.id,
        status: job.status,
        total: job.requestedTopLevelCount,
        completed: job.storedCount,
        failed: job.failedCount,
        createdAt: job.createdAt,
      }
    : null;

const mapAnalysisJob = (
  job: z.infer<typeof AnalysisJobSchema> | null,
): JobSummary | null =>
  job
    ? {
        id: job.id,
        status: job.status,
        total: job.totalCount,
        completed: job.completedCount,
        failed: job.failedCount,
        createdAt: job.createdAt,
      }
    : null;

export const createSupabaseDashboardRepository = ({
  rpc,
}: {
  rpc: DashboardRpc;
}): DashboardRepository => ({
  async loadSnapshot(workspaceId): Promise<DashboardSnapshot> {
    const { data, error } = await rpc("get_dashboard_summary", {
      target_workspace_id: workspaceId,
    });

    if (error) {
      throw new Error(error.message ?? "Dashboard could not be loaded");
    }

    const rawRow = Array.isArray(data) ? data[0] : null;
    if (!rawRow) {
      throw new Error("Dashboard snapshot is missing");
    }

    const row = DashboardRpcRowSchema.parse(rawRow);

    return {
      importedCount: row.imported_count,
      analyzedCount: row.analyzed_count,
      safeCount: row.safe_count,
      cautionCount: row.caution_count,
      riskCount: row.risk_count,
      selectedChannel: row.selected_channel,
      latestVideo: row.latest_video,
      latestImportJob: mapImportJob(row.latest_import_job),
      latestAnalysisJob: mapAnalysisJob(row.latest_analysis_job),
      priorityComments: row.priority_comments,
      recentCorrections: row.recent_corrections,
      recentActions: row.recent_actions,
      latestSummary: row.latest_summary,
    };
  },
});
