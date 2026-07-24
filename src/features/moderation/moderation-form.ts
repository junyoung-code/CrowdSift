import { z } from "zod";

import type { ModerationAction } from "./contracts";

const moderationRequestSchema = z.object({
  rawCommentId: z.uuid(),
  sourceImportJobId: z.uuid(),
  action: z.enum(["hold_for_review", "publish", "reject", "delete"]),
});

const moderationConfirmationSchema = z.object({
  requestId: z.uuid(),
  confirmation: z.literal("I_UNDERSTAND"),
});

export const parseModerationRequestForm = (
  formData: FormData,
): {
  rawCommentId: string;
  sourceImportJobId: string;
  action: ModerationAction;
} => {
  const parsed = moderationRequestSchema.safeParse({
    rawCommentId: formData.get("rawCommentId"),
    sourceImportJobId: formData.get("sourceImportJobId"),
    action: formData.get("action"),
  });

  if (!parsed.success) {
    throw new Error("Invalid moderation request");
  }

  return parsed.data;
};

export const parseModerationConfirmationForm = (
  formData: FormData,
): {
  requestId: string;
  confirmation: "I_UNDERSTAND";
} => {
  const parsed = moderationConfirmationSchema.safeParse({
    requestId: formData.get("requestId"),
    confirmation: formData.get("confirmation"),
  });

  if (!parsed.success) {
    throw new Error("Explicit confirmation required");
  }

  return parsed.data;
};
