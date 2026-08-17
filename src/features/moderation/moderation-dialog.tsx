"use client";

import { WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

import type { ModerationRequest } from "./contracts";

const ACTION_LABELS = {
  hold_for_review: "검토 대기로 이동",
  publish: "게시 승인",
  reject: "거절하여 숨기기",
  delete: "내 댓글 영구 삭제",
} as const;

const ACTION_WARNINGS = {
  hold_for_review:
    "댓글을 YouTube 검토 대기로 이동합니다. 이후 다시 게시하거나 거절할 수 있습니다.",
  publish: "댓글을 YouTube에 게시 상태로 승인합니다.",
  reject: "거절된 댓글의 답글도 함께 숨겨질 수 있습니다.",
  delete:
    "내가 작성한 댓글을 YouTube에서 영구 삭제하며 되돌릴 수 없습니다.",
} as const;

export function ModerationDialog({
  confirmAction,
  dismissHref,
  quota,
  request,
}: {
  confirmAction(formData: FormData): void | Promise<void>;
  dismissHref: string;
  request: ModerationRequest;
  /**
   * 오늘 남은 조치 횟수.
   *
   * 조치 한 번이 댓글 가져오기 스무 번 값이라 하루 200건에서 끊긴다. 누르기 전에
   * 보여야 의미가 있다. 모르면(null) 아무 말도 하지 않는다 — 지어내면 더 나쁘다.
   */
  quota?: { remainingActions: number } | null;
}) {
  const [confirmed, setConfirmed] = useState(false);

  if (request.state === "awaiting_scope") {
    return (
      <section className="moderation-dialog" aria-labelledby="moderation-title">
        <WarningCircle aria-hidden="true" weight="duotone" />
        <p>추가 권한 필요</p>
        <h2 id="moderation-title">댓글 조치 권한이 추가로 필요합니다</h2>
        <span>
          댓글 읽기 권한과 실제 조치 권한(youtube.force-ssl)은
          분리됩니다. 권한 연결 뒤에도 자동 실행하지 않고 다시
          확인합니다.
        </span>
        <div>
          <Link
            className="button button-primary"
            href={`/api/youtube/oauth/moderation?requestId=${request.requestId}`}
          >
            YouTube 조치 권한 연결
          </Link>
          <Link className="button button-secondary" href={dismissHref}>
            취소
          </Link>
        </div>
      </section>
    );
  }

  if (request.state === "running") {
    return (
      <form
        action={confirmAction}
        className="moderation-dialog"
        aria-labelledby="moderation-title"
      >
        <WarningCircle aria-hidden="true" weight="duotone" />
        <p>결과 확인 필요</p>
        <h2 id="moderation-title">YouTube 처리 결과를 다시 확인하세요</h2>
        <span>
          외부 조치는 다시 실행하지 않습니다. 잠시 후 저장된 요청 상태만
          확인하며, 결과가 불명확하면 YouTube Studio에서 직접 확인하도록
          안내합니다.
        </span>
        <input type="hidden" name="requestId" value={request.requestId} />
        <input
          type="hidden"
          name="confirmation"
          value="I_UNDERSTAND"
        />
        <div>
          <button className="button button-primary" type="submit">
            처리 상태 다시 확인
          </button>
          <Link className="button button-secondary" href={dismissHref}>
            나중에 확인
          </Link>
        </div>
      </form>
    );
  }

  return (
    <form
      action={confirmAction}
      className="moderation-dialog"
      aria-labelledby="moderation-title"
    >
      <WarningCircle aria-hidden="true" weight="duotone" />
      <p>AI 추천이며 최종 실행은 본인 결정입니다.</p>
      <h2 id="moderation-title">{ACTION_LABELS[request.action]}</h2>
      <dl>
        <div>
          <dt>조치 대상 댓글 ID</dt>
          <dd>{request.youtubeCommentId}</dd>
        </div>
        <div>
          <dt>예상 결과</dt>
          <dd>{ACTION_WARNINGS[request.action]}</dd>
        </div>
        {quota ? (
          <div>
            <dt>오늘 남은 조치</dt>
            <dd>
              {quota.remainingActions}회
              {quota.remainingActions <= 10
                ? " · YouTube 하루 한도가 곧 끝납니다"
                : ""}
            </dd>
          </div>
        ) : null}
      </dl>
      <input type="hidden" name="requestId" value={request.requestId} />
      <label>
        <input
          checked={confirmed}
          name="confirmation"
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
          type="checkbox"
          value="I_UNDERSTAND"
        />
        조치 결과와 되돌림 제약을 이해했습니다
      </label>
      <div>
        <button
          className="button button-primary"
          disabled={!confirmed}
          type="submit"
        >
          확인하고 실행
        </button>
        <Link className="button button-secondary" href={dismissHref}>
          취소
        </Link>
      </div>
    </form>
  );
}
