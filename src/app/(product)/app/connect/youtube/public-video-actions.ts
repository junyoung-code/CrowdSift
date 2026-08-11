"use server";

import { revalidatePath } from "next/cache";

import { requireDeveloperToolsViewer } from "@/features/developer-tools/require-developer-tools-viewer";
import { createPublicImportJobForWorkspace } from "@/features/ingestion/process-public-import-job";
import { getPublicYouTubeDevMode } from "@/features/youtube/public-dev-mode";
import { PublicYouTubeProviderError } from "@/features/youtube/google-public-read-provider";
import { previewPublicVideo } from "@/features/youtube/public-preview-service";
import { createPublicYouTubeReadProvider } from "@/features/youtube/public-provider-factory";
import type { PublicVideoPreview } from "@/features/youtube/public-read-contracts";
import { getServerEnv } from "@/lib/env";

export type PublicVideoPreviewActionState =
  | { status: "idle" }
  | { status: "success"; preview: PublicVideoPreview }
  | {
      status: "error";
      code:
        | "invalid_url"
        | "video_not_found"
        | "comments_disabled"
        | "quota_exceeded"
        | "provider_unavailable"
        | "mode_unavailable";
      message: string;
    };

export type PublicVideoStartActionState =
  | { status: "idle" }
  | { status: "created"; jobId: string }
  | {
      status: "error";
      code:
        | "invalid_request"
        | "comments_disabled"
        | "quota_exceeded"
        | "provider_unavailable"
        | "mode_unavailable";
      message: string;
    };

const assertPublicMode = () => {
  const environment = getServerEnv();
  const mode = getPublicYouTubeDevMode({
    NODE_ENV: process.env.NODE_ENV,
    ENABLE_PUBLIC_YOUTUBE_DEV_MODE:
      environment.ENABLE_PUBLIC_YOUTUBE_DEV_MODE,
    YOUTUBE_PUBLIC_API_KEY: environment.YOUTUBE_PUBLIC_API_KEY,
    EXTERNAL_PROVIDER_MODE: environment.EXTERNAL_PROVIDER_MODE,
    ALLOW_FIXTURE_PROVIDERS: environment.ALLOW_FIXTURE_PROVIDERS,
  });

  if (!mode.enabled || !mode.configured) {
    throw new Error("PUBLIC_MODE_UNAVAILABLE");
  }
};

const toPreviewError = (error: unknown): PublicVideoPreviewActionState => {
  if (error instanceof PublicYouTubeProviderError) {
    if (error.code === "VIDEO_NOT_FOUND") {
      return {
        status: "error",
        code: "video_not_found",
        message: "공개 영상을 찾을 수 없습니다. URL과 공개 상태를 확인해 주세요.",
      };
    }
    if (error.code === "COMMENTS_DISABLED") {
      return {
        status: "error",
        code: "comments_disabled",
        message: "이 영상은 댓글이 비활성화되어 있습니다.",
      };
    }
    if (error.code === "QUOTA_EXCEEDED") {
      return {
        status: "error",
        code: "quota_exceeded",
        message: "오늘 사용할 수 있는 YouTube API 할당량을 초과했습니다.",
      };
    }
    return {
      status: "error",
      code: "provider_unavailable",
      message: "YouTube 영상 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (
    error instanceof Error &&
    error.message === "PUBLIC_MODE_UNAVAILABLE"
  ) {
    return {
      status: "error",
      code: "mode_unavailable",
      message: "공개 URL 개발 모드 설정을 확인해 주세요.",
    };
  }

  return {
    status: "error",
    code: "invalid_url",
    message:
      "지원하는 YouTube 영상 URL을 입력해 주세요. watch, youtu.be, shorts URL을 사용할 수 있습니다.",
  };
};

const toStartError = (error: unknown): PublicVideoStartActionState => {
  if (error instanceof Error && error.message === "COMMENTS_DISABLED") {
    return {
      status: "error",
      code: "comments_disabled",
      message: "이 영상은 댓글이 비활성화되어 있습니다.",
    };
  }

  const previewError = toPreviewError(error);
  if (previewError.status !== "error") {
    return {
      status: "error",
      code: "provider_unavailable",
      message: "댓글 가져오기 작업을 만들지 못했습니다.",
    };
  }

  if (previewError.code === "invalid_url") {
    return {
      status: "error",
      code: "invalid_request",
      message: "영상 URL과 댓글 수를 다시 확인해 주세요.",
    };
  }

  if (previewError.code === "video_not_found") {
    return {
      status: "error",
      code: "provider_unavailable",
      message: previewError.message,
    };
  }
  if (previewError.code === "comments_disabled") {
    return {
      status: "error",
      code: "comments_disabled",
      message: previewError.message,
    };
  }
  if (previewError.code === "quota_exceeded") {
    return {
      status: "error",
      code: "quota_exceeded",
      message: previewError.message,
    };
  }
  if (previewError.code === "mode_unavailable") {
    return {
      status: "error",
      code: "mode_unavailable",
      message: previewError.message,
    };
  }

  return {
    status: "error",
    code: "provider_unavailable",
    message: previewError.message,
  };
};

export const previewPublicVideoAction = async (
  _previousState: PublicVideoPreviewActionState,
  formData: FormData,
): Promise<PublicVideoPreviewActionState> => {
  await requireDeveloperToolsViewer();

  try {
    assertPublicMode();

    return {
      status: "success",
      preview: await previewPublicVideo(
        { url: formData.get("url") },
        {
          assertAuthenticatedWorkspace: async () => undefined,
          assertDevelopmentMode: assertPublicMode,
          provider: createPublicYouTubeReadProvider(),
        },
      ),
    };
  } catch (error) {
    return toPreviewError(error);
  }
};

export const startPublicVideoImportAction = async (
  _previousState: PublicVideoStartActionState,
  formData: FormData,
): Promise<PublicVideoStartActionState> => {
  const { workspaceId } = await requireDeveloperToolsViewer();

  try {
    assertPublicMode();
    const job = await createPublicImportJobForWorkspace({
      workspaceId,
      url: formData.get("url"),
      requestedTotalCount: formData.get("requestedTotalCount"),
    });

    revalidatePath("/app");
    revalidatePath("/app/developer-tools");
    return { status: "created", jobId: job.id };
  } catch (error) {
    return toStartError(error);
  }
};
