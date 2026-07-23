"use client";

import { useActionState } from "react";

import { requestMagicLink } from "./actions";

export function SignInForm() {
  const [state, formAction, isPending] = useActionState(
    requestMagicLink,
    undefined,
  );

  return (
    <form action={formAction} className="sign-in-form">
      <label htmlFor="email">이메일</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="creator@example.com"
        required
      />
      <button className="button button-primary" disabled={isPending} type="submit">
        {isPending ? "전송 중…" : "로그인 링크 받기"}
      </button>
      {state ? (
        <p
          className={`form-message form-message-${state.status}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
