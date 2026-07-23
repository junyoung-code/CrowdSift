import type {
  CommentCategory,
  ReviewLevel,
} from "@/features/analysis/contracts";

export type ChannelSummary = {
  youtubeChannelId: string;
  title: string;
  handle: string | null;
  thumbnailUrl: string | null;
};

export type VideoSummary = {
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
};

export type JobSummary = {
  id: string;
  status: string;
  total: number;
  completed: number;
  failed: number;
  createdAt: string;
};

export type PriorityCommentSummary = {
  rawCommentId: string;
  reviewLevel: Extract<ReviewLevel, "caution" | "risk">;
  category: CommentCategory;
  sanitizedText: string | null;
};

export type FeedbackSummary = {
  id: string;
  decision: string;
  correctedReviewLevel: ReviewLevel | null;
  editedSanitizedFeedback: string | null;
  createdAt: string;
};

export type ActionSummary = {
  id: string;
  action: string;
  state: string;
  createdAt: string;
};

export type DashboardSnapshot = {
  importedCount: number;
  analyzedCount: number;
  safeCount: number;
  cautionCount: number;
  riskCount: number;
  selectedChannel: ChannelSummary | null;
  latestVideo: VideoSummary | null;
  latestImportJob: JobSummary | null;
  latestAnalysisJob: JobSummary | null;
  priorityComments: PriorityCommentSummary[];
  recentCorrections: FeedbackSummary[];
  recentActions: ActionSummary[];
  latestSummary: string | null;
};

export type DashboardData =
  | { state: "disconnected" }
  | { state: "connected_empty"; channel: ChannelSummary }
  | {
      state: "ready";
      channel: ChannelSummary;
      video: VideoSummary | null;
      metrics: {
        imported: number;
        analyzed: number;
        caution: number;
        risk: number;
      };
      distribution: {
        safe: number;
        caution: number;
        risk: number;
      };
      latestImport: JobSummary | null;
      latestAnalysis: JobSummary | null;
      priorityComments: PriorityCommentSummary[];
      recentCorrections: FeedbackSummary[];
      recentActions: ActionSummary[];
      aiSummary: string | null;
    };

export interface DashboardRepository {
  loadSnapshot(workspaceId: string): Promise<DashboardSnapshot>;
}

export const getDashboardData = async (
  workspaceId: string,
  repository: DashboardRepository,
): Promise<DashboardData> => {
  const snapshot = await repository.loadSnapshot(workspaceId);

  if (!snapshot.selectedChannel) {
    return { state: "disconnected" };
  }

  if (snapshot.importedCount === 0) {
    return {
      state: "connected_empty",
      channel: snapshot.selectedChannel,
    };
  }

  return {
    state: "ready",
    channel: snapshot.selectedChannel,
    video: snapshot.latestVideo,
    metrics: {
      imported: snapshot.importedCount,
      analyzed: snapshot.analyzedCount,
      caution: snapshot.cautionCount,
      risk: snapshot.riskCount,
    },
    distribution: {
      safe: snapshot.safeCount,
      caution: snapshot.cautionCount,
      risk: snapshot.riskCount,
    },
    latestImport: snapshot.latestImportJob,
    latestAnalysis: snapshot.latestAnalysisJob,
    priorityComments: snapshot.priorityComments,
    recentCorrections: snapshot.recentCorrections,
    recentActions: snapshot.recentActions,
    aiSummary: snapshot.latestSummary,
  };
};
