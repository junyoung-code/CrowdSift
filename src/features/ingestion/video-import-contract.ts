import { z } from "zod";

export const videoImportRequestSchema = z.object({
  youtubeVideoId: z.string().trim().min(1),
  topLevelLimit: z.coerce.number().int().min(20).max(50),
});

export type VideoImportRequest = z.infer<typeof videoImportRequestSchema>;

export const parseVideoImportRequest = (input: {
  youtubeVideoId: unknown;
  topLevelLimit: unknown;
}): VideoImportRequest => {
  const parsed = videoImportRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error("invalid_import_request");
  }

  return parsed.data;
};

const importFailureMessages = {
  comments_disabled:
    "이 영상은 YouTube에서 댓글 사용이 중지되어 있어 가져올 수 없습니다.",
  quota_exceeded:
    "오늘 사용할 수 있는 YouTube API 할당량을 모두 사용했습니다. 할당량이 갱신된 뒤 다시 시도해 주세요.",
  permission_revoked:
    "YouTube 읽기 권한이 만료되었거나 해제되었습니다. 채널을 다시 연결해 주세요.",
  provider_error:
    "YouTube에서 댓글을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

export type ImportFailureCode = keyof typeof importFailureMessages;

export const getImportFailureMessage = (code: string) =>
  importFailureMessages[code as ImportFailureCode] ??
  "댓글 가져오기를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
