import { UserCircle } from "@phosphor-icons/react/dist/ssr";

export type CommentSourceBlockProps = {
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  publishedAt: string | null;
  textDisplay: string;
  capturedAt?: string;
  protectedSource?: boolean;
};

const formatKoreanDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export function CommentSourceBlock({
  authorDisplayName,
  authorAvatarUrl,
  publishedAt,
  textDisplay,
  capturedAt,
  protectedSource = false,
}: CommentSourceBlockProps) {
  const displayName = authorDisplayName ?? "이름 없는 시청자";
  const publishedLabel = publishedAt ? formatKoreanDate(publishedAt) : null;
  const capturedLabel =
    protectedSource && capturedAt ? formatKoreanDate(capturedAt) : null;

  return (
    <section
      aria-label={protectedSource ? "확인한 댓글 원문" : "댓글 원문"}
      className={`comment-source-block ${
        protectedSource ? "is-protected" : "is-safe"
      }`}
    >
      {protectedSource ? (
        <strong className="comment-source-protected-label">확인한 원문</strong>
      ) : null}

      <div className="comment-source-author">
        {authorAvatarUrl ? (
          // The URL is a captured YouTube profile image, not an app asset.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${displayName} 프로필`}
            className="comment-source-avatar"
            referrerPolicy="no-referrer"
            src={authorAvatarUrl}
          />
        ) : (
          <span className="comment-source-avatar-fallback" aria-hidden="true">
            <UserCircle weight="duotone" />
          </span>
        )}
        <div>
          <strong>{displayName}</strong>
          {publishedLabel && publishedAt ? (
            <time dateTime={publishedAt}>{publishedLabel}</time>
          ) : null}
        </div>
      </div>

      <p className="comment-source-text">{textDisplay}</p>

      {capturedLabel && capturedAt ? (
        <small>
          수집 시각: <time dateTime={capturedAt}>{capturedLabel}</time>
        </small>
      ) : null}
    </section>
  );
}
