export type ModerationAction =
  | "hold_for_review"
  | "publish"
  | "reject"
  | "delete";

export type ModerationRequestState =
  | "pending_confirmation"
  | "awaiting_scope"
  | "running"
  | "succeeded"
  | "failed";

export type ActionResult = {
  requestId: string;
  state: "succeeded" | "failed";
  providerStatus: number | null;
  executedAt: string | null;
  errorCode: string | null;
};

export type ModerationRequest = {
  requestId: string;
  youtubeCommentId: string;
  action: ModerationAction;
  state: ModerationRequestState;
};
