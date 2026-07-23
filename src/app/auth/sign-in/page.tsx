import { ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { SignInForm } from "./sign-in-form";

type SignInPageProps = {
  searchParams: Promise<{
    error?: string | string[];
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const parameters = await searchParams;
  const hasExpiredError = parameters.error === "expired";

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="sign-in-title">
        <Link className="auth-brand" href="/">
          <span aria-hidden="true">
            <ShieldCheck weight="fill" />
          </span>
          CommentHawk
        </Link>
        <p className="auth-eyebrow">CREATOR SIGN IN</p>
        <h1 id="sign-in-title">CommentHawk에 로그인</h1>
        <p className="auth-description">
          이메일로 안전한 일회용 로그인 링크를 받습니다. 비밀번호는 저장하지
          않습니다.
        </p>
        {hasExpiredError ? (
          <p className="form-message form-message-error" role="alert">
            로그인 링크가 만료되었거나 유효하지 않습니다. 새 링크를 받아 주세요.
          </p>
        ) : null}
        <SignInForm />
        <div className="auth-separation-note">
          <strong>권한은 분리해서 관리합니다</strong>
          <p>
            YouTube 채널 권한은 로그인 후 별도로 연결하며, 댓글을 숨기거나
            삭제하는 권한은 필요한 순간에 다시 확인합니다.
          </p>
        </div>
      </section>
    </main>
  );
}
