export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f9fc] text-slate-950">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_50%_0%,rgba(37,99,235,0.13),transparent_64%)]"
        aria-hidden="true"
      />

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 sm:px-10 lg:px-12">
        <div className="flex items-center gap-3" aria-label="CommentHawk 홈">
          <span className="grid size-10 place-items-center rounded-xl bg-blue-600 text-sm font-black tracking-tight text-white shadow-[0_8px_24px_rgba(37,99,235,0.28)]">
            CH
          </span>
          <span className="text-lg font-bold tracking-[-0.03em]">CommentHawk</span>
        </div>

        <span className="rounded-full border border-blue-100 bg-white/80 px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm backdrop-blur">
          Private preview
        </span>
      </header>

      <section className="relative mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-6xl items-center px-6 pb-24 pt-12 sm:px-10 sm:pt-16 lg:px-12">
        <div className="max-w-3xl">
          <p className="mb-6 text-xs font-bold tracking-[0.22em] text-blue-700 sm:text-sm">
            AI COMMENT OPERATIONS
          </p>

          <h1 className="text-balance text-4xl font-bold leading-[1.14] tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-7xl">
            중요한 댓글은 놓치지 않고,
            <span className="mt-2 block text-blue-600">
              악성 댓글에는 끌려가지 않도록.
            </span>
          </h1>

          <p className="mt-7 max-w-2xl text-pretty text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            CommentHawk는 크리에이터가 댓글 속 질문과 피드백을 발견하고,
            유해한 반응은 안전하게 검토할 수 있도록 돕는 AI 댓글 관리 도구입니다.
          </p>

          <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled
              aria-describedby="connection-status"
              className="inline-flex h-12 cursor-not-allowed items-center justify-center rounded-xl bg-slate-900 px-6 text-sm font-semibold text-white opacity-70 shadow-[0_12px_30px_rgba(15,23,42,0.18)]"
            >
              YouTube 연결하기
            </button>
            <p
              id="connection-status"
              className="flex items-center gap-2 text-sm font-medium text-slate-500"
            >
              <span className="size-2 rounded-full bg-amber-400" aria-hidden="true" />
              OAuth 연동 준비 중
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
