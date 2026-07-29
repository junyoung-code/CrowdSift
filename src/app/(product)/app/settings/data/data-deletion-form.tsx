"use client";

import { WarningCircle } from "@phosphor-icons/react";
import { useActionState } from "react";

import { WORKSPACE_DELETION_CONFIRMATION } from "@/features/auth/workspace-deletion-service";

import { deleteWorkspaceAction } from "./actions";

export function DataDeletionForm() {
  const [state, formAction, isPending] = useActionState(
    deleteWorkspaceAction,
    undefined,
  );

  return (
    <form action={formAction} className="data-deletion-form">
      <div className="danger-heading">
        <WarningCircle aria-hidden="true" weight="fill" />
        <div>
          <h2>CrowdSift 데이터 삭제</h2>
          <p>
            저장한 채널, 영상, 댓글 원문, 분석 결과, 피드백과 감사 기록을
            삭제합니다.
          </p>
        </div>
      </div>

      <div className="deletion-boundary">
        <strong>삭제되지 않는 항목</strong>
        <p>
          CrowdSift 로그인 계정은 삭제되지 않습니다. 삭제 후 다시 로그인하면
          비어 있는 새 workspace가 생성됩니다.
        </p>
      </div>

      <label htmlFor="confirmation">
        계속하려면 <strong>{WORKSPACE_DELETION_CONFIRMATION}</strong>를 입력하세요.
      </label>
      <input
        id="confirmation"
        name="confirmation"
        aria-label="확인 문구"
        placeholder={WORKSPACE_DELETION_CONFIRMATION}
        autoComplete="off"
        required
      />

      {state ? (
        <p className="form-message form-message-error" role="alert">
          {state.message}
        </p>
      ) : null}

      <button className="danger-button" disabled={isPending} type="submit">
        {isPending ? "삭제 중…" : "CrowdSift 데이터 영구 삭제"}
      </button>
    </form>
  );
}
