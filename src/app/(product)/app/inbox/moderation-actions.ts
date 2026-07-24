"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireViewer } from "@/features/auth/require-viewer";
import {
  parseModerationConfirmationForm,
  parseModerationRequestForm,
} from "@/features/moderation/moderation-form";
import {
  confirmYouTubeModeration,
  requestYouTubeModeration,
} from "@/features/moderation/process-moderation";

export const requestYouTubeModerationAction = async (formData: FormData) => {
  let input;
  try {
    input = parseModerationRequestForm(formData);
  } catch {
    redirect("/app/inbox?moderationError=invalid_request");
  }

  const { userId, workspaceId } = await requireViewer();
  let request;
  try {
    request = await requestYouTubeModeration({
      ...input,
      workspaceId,
      actorUserId: userId,
    });
  } catch {
    redirect("/app/inbox?moderationError=request_failed");
  }

  revalidatePath("/app/inbox");
  redirect(`/app/inbox?moderation=${encodeURIComponent(request.requestId)}`);
};

export const confirmYouTubeModerationAction = async (formData: FormData) => {
  let input;
  try {
    input = parseModerationConfirmationForm(formData);
  } catch {
    redirect("/app/inbox?moderationError=confirmation_required");
  }

  const { userId, workspaceId } = await requireViewer();
  let result;
  try {
    result = await confirmYouTubeModeration({
      ...input,
      workspaceId,
      actorUserId: userId,
    });
  } catch {
    redirect(
      `/app/inbox?moderation=${encodeURIComponent(input.requestId)}&moderationError=execution_failed`,
    );
  }

  revalidatePath("/app/inbox");
  if (result.errorCode === "provider_result_unknown") {
    redirect(
      `/app/inbox?moderationError=provider_result_unknown&requestId=${encodeURIComponent(result.requestId)}`,
    );
  }
  redirect(
    `/app/inbox?moderationResult=${encodeURIComponent(result.state)}&requestId=${encodeURIComponent(result.requestId)}`,
  );
};
