# 댓글 분류 파이프라인 v1

이어서 작업하거나 직접 돌려보려는 사람을 위한 안내다.
기준과 측정 기록은 [`docs/comment-service-roadmap.md`](../../../docs/comment-service-roadmap.md)에 있고, 이 문서는 **어디까지 됐고 어떻게 돌리는지**만 다룬다.

## 먼저 알아야 할 것 세 가지

**1. 이 폴더가 새 파이프라인이다. `src/features/analysis/`는 옛 것이다.**

두 파이프라인이 같이 있다. 화면과 API는 **아직 옛 것을 부른다.**

```
src/app/(product)/app/inbox/actions.ts          → features/analysis
src/app/api/analysis-jobs/[jobId]/process/...   → features/analysis
src/features/inbox/comment-inbox.tsx            → features/analysis
```

그래서 **인박스 화면에서 테스트하면 이 폴더의 코드는 실행되지 않는다.** 지금 새 파이프라인을 돌리는 길은 아래의 측정 스크립트뿐이다. 옛 폴더에도 `confidence`, `second-pass` 같은 비슷한 이름이 있으니 헷갈리지 않게 주의한다.

**2. 이 작업은 `main`에 없다.** 브랜치가 쌓여 있다.

```
main
 └─ feature/first-pass-moderation-luna   1-A, 1-B
     └─ feature/branch-routing            2. 우선 분기, 확신도 3단
         └─ feature/terra-verification    3. Terra, 최종 확정  ← 최신
```

**3. 등급을 정하는 것은 모델이 아니라 코드다.**

Luna는 후보를, Terra는 자기 판단을 낼 뿐이다. 합치는 것은 [`branch.ts`](./branch.ts)와 [`verdict.ts`](./verdict.ts)이며, 이 둘은 모델을 부르지 않는 순수 함수라 테스트로 전부 확인할 수 있다.

## 어디까지 됐나

| 단계 | 상태 | 파일 |
| --- | --- | --- |
| 1-A 무료 필터 | ✅ | [`moderation.ts`](./moderation.ts) |
| 1-B Luna 1차 분류 | ✅ | [`luna-first-pass.ts`](./luna-first-pass.ts) |
| 1단계 병렬 실행 | ✅ | [`first-pass.ts`](./first-pass.ts) |
| 2. 우선 분기 | ✅ | [`branch.ts`](./branch.ts) |
| 3. Terra 2차 검증 | ✅ | [`terra-verification.ts`](./terra-verification.ts) |
| 최종 등급 확정 | ✅ | [`verdict.ts`](./verdict.ts) |
| 4. Luna 순화 생성 | ⬜ | — |
| 저장·로그 계층 | ⬜ | — |
| 화면 연결 | ⬜ | 인박스는 아직 옛 파이프라인을 본다 |

**결과가 아무 데도 저장되지 않는다.** 저장 계층이 없어서, 지금은 측정 스크립트가 콘솔과 `measurements/*.json`에만 남긴다.

## 돌려보기

`.env.local`에 아래가 필요하다. 값은 [`.env.example`](../../../.env.example) 참고.

```
OPENAI_API_KEY=
OPENAI_LUNA_MODEL=gpt-5.6-luna
OPENAI_TERRA_MODEL=gpt-5.6-terra
OPENAI_MODERATION_MODEL=omni-moderation-latest
```

```bash
# 연결 확인 — 5건만, 1분, 몇 원
npx tsx scripts/measure-pipeline.ts 5

# 전 구간 90건 — 20분 안팎, $0.05 정도
npx tsx scripts/measure-pipeline.ts

# 결과를 읽기 좋은 한 장으로 (measurements/review.html)
npx tsx scripts/review-page.ts
```

댓글 90건은 [`docs/test-comment-plan.md`](../../../docs/test-comment-plan.md)의 표에서 읽는다. 댓글을 고치려면 그 문서를 고친다.

**표에 적힌 기대 등급은 정답이 아니다.** 기준 문서를 읽고 붙인 짐작이며 팀이 합의한 값이 아니다. 결과가 다르다고 해서 틀린 것이 아니다.

다른 스크립트:

```bash
npx tsx scripts/measure-first-pass.ts    # 1차만. Terra 비용 없음
npx tsx scripts/measure-moderation.ts    # 무료 필터만. 무료
```

## 모델을 부르지 않고 확인하기

분기와 확정 규칙은 순수 함수라 API 없이 전부 볼 수 있다. 규칙을 손대려면 여기부터 읽는 것이 빠르다.

```bash
npx vitest run src/features/classification
```

## 알아두면 헤매지 않는 것들

**Terra는 Luna의 판단을 보지 못한다.** 후보 등급도, 확신도도, 분기 이유도 넘기지 않는다. 앞선 답을 보여주면 거기 끌려가서 검증이 도장 찍기가 되기 때문이다. 이것을 지키는 테스트가 있다 — `terra-verification.test.ts`의 "never carries the first pass verdict into the material".

**확신도는 0~1 소수가 아니라 `clear` / `borderline` / `unclear` 세 단계다.** 소수는 실측에서 신호가 되지 못했다. 값이 다섯 개에 뭉치고 틀린 판단에도 0.98이 붙었다. 자세한 것은 로드맵 10번.

**모더레이션 실패는 `null`이지 빈 결과가 아니다.** "위험한 게 없었다"와 "확인하지 못했다"는 다르다. `null`이면 Terra로 간다.

**검토 대기는 등급이 아니라 상태다.** `verdict.level`이 `null`이 된다. 안전으로 읽히지 않게 일부러 비운다.

**프롬프트를 고쳤으면 버전 상수도 올린다.** [`prompts.ts`](./prompts.ts)의 `LUNA_FIRST_PASS_PROMPT_VERSION`, `TERRA_VERIFICATION_PROMPT_VERSION`. 측정 결과 JSON에 이 값이 찍혀서, 두 측정을 비교할 때 어느 기준이었는지 알 수 있다.

**측정할 때는 한 번에 하나만 바꾼다.** 후보 등급은 실행마다 흔들린다. 같은 댓글이 회차마다 다른 등급으로 나온 사례가 로드맵 10번에 기록돼 있다. 두 가지를 같이 바꾸면 무엇이 무엇을 움직였는지 알 수 없다.

**테스트 댓글을 프롬프트 예시로 넣지 않는다.** 답을 알려주고 시험 보는 것이 된다.

## 지금 열려 있는 문제

- **답글 맥락이 없다** — 계획서 기대와 갈리는 9건 중 **6건이 부모 댓글 부족 하나**로 설명된다. `ㄹㅇ 인정` 은 무엇에 동의하는지가 등급을 가르는데 그 무엇이 입력에 없다. 프롬프트로 풀 수 없고, 7차까지 프롬프트로 할 수 있는 일은 끝났다.
- **위험은 한 방향 문이다** — Luna가 잘못 올린 위험을 Terra가 되돌릴 수 없다. `개노답이다`가 그 사례다.
- **신규 채널 콜드 스타트** — `allowedSlang`이 비면 칭찬형 비속어가 전부 주의로 숨겨진다. 은어를 채우는 경로가 아직 없다.
