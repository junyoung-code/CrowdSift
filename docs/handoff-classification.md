# 댓글 분석 파이프라인 인수인계

UI/UX 작업을 마치고 이 분석 로직을 붙일 사람을 위한 문서다.
**무엇이 되고, 무엇이 안 되고, 붙일 때 무엇을 알아야 하는지**를 다룬다.

돌려보는 방법만 필요하면 [`src/features/classification/README.md`](../src/features/classification/README.md) 쪽이 짧다.
기준과 실측 기록은 [`docs/comment-service-roadmap.md`](./comment-service-roadmap.md)에 있다.

```
브랜치   feature/terra-verification
필요     .env.local 에 OPENAI_API_KEY + 모델 3개 (.env.example 참고)
확인     npx tsx scripts/measure-pipeline.ts 5     1분, 몇 원
```

---

# 1. 먼저 알아야 할 세 가지

## 1-1. 파이프라인이 두 벌 있고, 화면은 옛것을 본다

```
src/features/analysis/         옛 파이프라인   ← 화면과 API가 지금 이걸 부른다
src/features/classification/   새 파이프라인   ← 이 문서가 다루는 것
```

**인박스 화면에서 테스트하면 새 코드는 한 줄도 실행되지 않는다.** 지금 새 파이프라인을 돌리는 길은 측정 스크립트 하나뿐이다.

옛 폴더를 부르는 곳:

```
src/app/(product)/app/inbox/actions.ts
src/app/api/analysis-jobs/[jobId]/process/route.ts
src/features/inbox/comment-inbox.tsx
src/features/dashboard/*
src/features/feedback/*
```

두 폴더에 `confidence`, `second-pass`, `prompts`, `schemas` 처럼 **같은 이름의 파일이 따로 있다.** 헷갈리기 쉬우니 경로를 먼저 확인하고 열어야 한다.

## 1-2. 등급을 정하는 것은 모델이 아니라 코드다

이게 이 설계의 중심이다.

```
Luna    후보 등급 + 신호를 낸다        ← 판단이 아니라 재료
Terra   자기 판단을 낸다               ← 여전히 재료
코드    둘과 모더레이션을 합쳐 확정한다   ← 여기서 등급이 정해진다
```

합치는 코드는 [`branch.ts`](../src/features/classification/branch.ts)와 [`verdict.ts`](../src/features/classification/verdict.ts) 두 개뿐이고, 모델을 부르지 않는 순수 함수라 **API 키 없이 테스트로 전부 확인할 수 있다.** 규칙을 이해하려면 여기부터 읽는 것이 빠르다.

```bash
npx vitest run src/features/classification
```

## 1-3. 아무것도 저장되지 않는다

결과는 콘솔과 `measurements/*.json`에만 남는다. DB에 쓰는 코드가 없다. 자세한 것은 5번.

---

# 2. 댓글 하나가 지나가는 길

```
                  ┌─────────────────────────────┐
   댓글 원문 ─────>│ 1-A 무료 필터 (moderation)   │─┐
   (+ 부모 댓글)   │ 1-B Luna 1차 분류            │─┤  둘을 동시에 부른다
                  └─────────────────────────────┘ │
                                                   ▼
                                    ┌──────────────────────┐
                                    │ 2. 우선 분기 (코드)    │
                                    └──────────────────────┘
                                       │              │
                        조건 모두 충족   │              │ 하나라도 어긋남
                                       ▼              ▼
                                  ⟦즉시 안전⟧   ┌──────────────────┐
                                  Terra 안 부름  │ 3. Terra 2차 검증 │
                                                └──────────────────┘
                                                          ▼
                                              ┌──────────────────────┐
                                              │ 최종 등급 확정 (코드)   │
                                              └──────────────────────┘
                                                 │        │        │
                                          안전   │  주의   │  위험   │  검토 대기
                                                 ▼        ▼        ▼
                                              원문 노출  ┌────────┐  원문 숨김
                                                        │4. 순화 │  증거 보관
                                                        └────────┘
                                                            ▼
                                                        검사 통과분만
```

## 실제 90건을 넣으면

```
즉시 안전    29건   Terra 를 부르지 않고 확정. 원문 노출
안전          2건   Terra 검증 후 안전. 원문 노출
주의         32건   원문 숨김. 그중 20건은 순화문 생성, 11건은 순화 없음
위험         26건   원문 숨김. 순화 없음. 증거 보관
검토 대기     1건   등급 없음. 사람이 본다
```

토큰: Luna 33만 / Terra 23만 / 순화 4만. 90건에 $0.05 정도.

---

# 3. 각 단계가 하는 일

## 1-A. 무료 필터 — [`moderation.ts`](../src/features/classification/moderation.ts)

`omni-moderation-latest`. 무료다.

**한국어에서 거의 못 잡는다.** 90건 중 5건만 걸었고, 위험으로 적어둔 26건 중 3건이었다. 스토킹·개인정보 범주가 아예 없고, `죽는 줄` 같은 관용구를 글자대로 읽어 자해로 건다.

그래도 유지하는 이유는 **이 구조에서 오류가 모두 안전한 쪽으로 떨어지기 때문**이다. 오탐이면 Terra 를 한 번 더 부를 뿐이고, 미탐이면 Luna 가 이미 잡는다. 무료이므로 손해가 없다.

**호출 실패는 `null` 이다. 빈 결과가 아니다.** "위험한 게 없었다"와 "확인하지 못했다"는 다르고, `null` 이면 무조건 Terra 로 간다. 붙일 때 이걸 `false` 로 뭉개면 필터가 죽어 있는 동안 위험 댓글이 그대로 나간다.

## 1-B. Luna 1차 — [`luna-first-pass.ts`](../src/features/classification/luna-first-pass.ts)

`gpt-5.6-luna`, `reasoning: none`. 싸고 빠르다.

**등급을 확정하지 않는다.** 후보와 신호만 낸다. 2차 검증이 필요한지도 여기서 정하지 않는다 — 그건 코드의 일이다.

## 2. 우선 분기 — [`branch.ts`](../src/features/classification/branch.ts)

모델을 부르지 않는다. 1단계의 두 답을 규칙으로 조합해 **여기서 끝낼지 Terra 로 보낼지만** 정한다. 끝나는 경우는 안전 하나뿐이다.

즉시 안전 조건 — 아래를 **모두** 만족해야 한다.

```
Luna 후보가 safe
Luna certainty 가 clear
모더레이션이 flagged=false 이고 오류가 아님
위험 신호 플래그가 하나도 없음
위치·일정 언급이 없음
채널 민감 주제와 충돌하지 않음
```

하나라도 어긋나면 **이유를 전부 기록해** Terra 로 넘긴다. 첫 번째 이유에서 멈추지 않는다.

## 3. Terra 2차 검증 — [`terra-verification.ts`](../src/features/classification/terra-verification.ts)

`gpt-5.6-terra`, `reasoning: low`.

**Terra 는 Luna 의 판단을 보지 못한다.** 후보 등급도, 확신도도, 왜 넘어왔는지도 넘기지 않는다. 앞선 답을 보여주면 모델이 거기 끌려가서 검증이 도장 찍기가 되고, "두 판단이 갈렸다" 가 정보가 되지 못한다.

실제로 검증한 60여 건 중 **13~16%에서 두 판단이 갈린다.** 답을 보여줬다면 이 값은 0에 가까웠을 것이다.

이 계약을 지키는 테스트가 있다 — `terra-verification.test.ts` 의 `"never carries the first pass verdict into the material"`. **여기에 Luna 결과를 넘기도록 고치면 테스트가 깨진다. 의도된 것이다.**

모더레이션 결과와 부모 댓글 원문은 넘긴다. 그것은 판단이 아니라 사실이다.

## 최종 확정 — [`verdict.ts`](../src/features/classification/verdict.ts)

모델을 부르지 않는다. 순서대로 본다.

```
1. Terra 가 완화 불가 신호를 확인          → 위험 확정 (다른 무엇보다 앞선다)
2. Terra certainty 가 unclear             → 검토 대기 (등급 없음)
3. 두 판단이 같음                          → 그 등급 확정
4. 두 판단이 갈림                          → 아래 규칙
5. 모더레이션 최소 등급이 더 높음            → 그쪽으로 올림
```

**불일치 규칙 — 위험이 걸렸는지로 나눈다**

```
한쪽이라도 위험     → 높은 쪽 (= 위험)
안전 ↔ 주의        → Terra 쪽. 단 Terra certainty 가 clear 일 때만
                     borderline·unclear 면 보호 쪽(주의)
```

무조건 높은 쪽으로 올리면 등급이 영원히 내려가지 않아 "채널 밈을 악성으로 오해했는지 확인" 이라는 2차 검증의 목적이 죽는다. 그렇다고 위험까지 내리게 두면 협박을 놓친다. **두 실수의 무게가 다르므로 나눠서 다룬다.**

## 4. Luna 순화 — [`luna-rewrite.ts`](../src/features/classification/luna-rewrite.ts)

**최종 등급이 주의이고 순화할 재료가 있을 때만** 부른다. 부를지 말지는 `verdict.allowRewrite` 가 이미 정해 두었으므로 모델에게 다시 묻지 않는다.

위험 댓글에는 만들지 않는다. 피드백이 섞여 있어도 만들지 않는다.

**만든 문장을 그대로 내보내지 않는다.** [`rewrite-guard.ts`](../src/features/classification/rewrite-guard.ts) 가 코드로 검사하고, 통과하지 못하면 순화문 없이 간다.

```
model_reported_addition   모델이 스스로 지어냈다고 답함
empty                     비어 있음
copied_from_source        원문 8자 이상이 그대로 있음
too_many_marks            한 문장에 꾸밈 표시가 둘 이상
disallowed_mark           ㅋㅋㅋ · ㅠㅠ · 이모지
```

**나쁜 순화문보다 없는 것이 낫다.** 크리에이터는 원문을 보지 않기로 했으므로, 통과한 문장이 그 댓글에 대해 보게 될 전부다. 지어낸 요청을 보고 영상을 고치는 일이 일어나서는 안 된다.

**이 검사가 잡지 못하는 것** — 말을 바꿔 옮긴 경우다. `편집이 개 느리네요` 는 가시를 그대로 두고도 여덟 자 연속을 피한다. 그쪽은 프롬프트가 맡는다.

---

# 4. 화면이 받게 될 데이터

실제 타입은 [`schemas.ts`](../src/features/classification/schemas.ts)와 [`verdict.ts`](../src/features/classification/verdict.ts)에 있다. 아래는 화면에서 쓸 만한 것만 추린 것이다.

## 최종 결과 (`Verdict`)

```ts
{
  status: "decided" | "review_queue"
  level: "safe" | "caution" | "danger" | null   // 검토 대기면 null
  basis: VerdictBasis                            // 왜 이 등급인지
  agreedWithFirstPass: boolean                   // 두 판단이 같았는지
  allowRewrite: boolean                          // 순화문을 만들었는지
  hideSource: boolean                            // 원문을 숨겨야 하는지
  recommendedActions: RecommendedAction[]        // 제안. 실행 아님
  safetyCase: boolean                            // 작성자 본인의 위기 신호
  raisedByModeration: boolean
}
```

**`level` 이 `null` 인 경우를 반드시 다뤄야 한다.** 검토 대기는 등급이 아니라 상태이며, 안전으로 읽히지 않게 일부러 비워 둔다. `level ?? "safe"` 같은 코드를 쓰면 안 된다.

## 등급별로 화면이 해야 할 일

| 등급 | 원문 | 순화문 | 그 밖에 |
| --- | --- | --- | --- |
| 안전 | 그대로 표시 | 없음 | 피드백·질문·긍정 반응으로 분류 |
| 주의 + 순화 있음 | **숨김** | 표시 | 원문에 없는 칭찬·해결책 금지 |
| 주의 + 순화 없음 | **숨김** | 없음 | 개별 전달 안 함. 통계에만 포함 |
| 위험 | **숨김** | 없음 | 삭제·차단·신고 검토. 증거 보관 |
| 검토 대기 | **숨김** | 없음 | 별도 큐. 두 판단과 모더레이션 결과를 함께 보여줌 |

**해로운 원문은 기본 숨김이다.** 사용자가 명시적으로 펼쳤을 때만 보여준다.

## `recommendedActions` 는 제안이다

```
show_source · show_rewritten_only · hide_source
consider_delete · consider_block · consider_report
preserve_evidence · notify_now
```

**삭제·차단·신고는 사용자가 확인해야 실행된다.** AI 가 권할 수는 있어도 되돌릴 수 없는 행동을 대신 하지 않는다. 이건 프로젝트 규칙이다.

## `basis` — 검토 화면에서 "왜 이렇게 됐는지" 보여줄 때

```
both_agreed                      두 판단 일치
non_negotiable_risk_confirmed    완화 불가 신호 확인
verifier_uncertain               Terra 가 정하지 못함
verifier_decided_boundary        안전↔주의 경계에서 Terra 가 정함
danger_in_either                 한쪽이 위험이라 높은 쪽
protective_on_boundary           경계에서 보호 쪽으로
```

## 확신도는 소수가 아니다

```
certainty: "clear" | "borderline" | "unclear"
```

옛 파이프라인의 `confidence: number` 와 **다른 것이다.** 0~1 소수를 쓰다가 바꿨다. 실측에서 90건 중 89건이 0.95~0.99 에 몰렸고, 틀린 판단에도 0.98 이 붙었으며, 같은 댓글이 실행마다 0.82 와 0.90 이상으로 갈렸다. 모델이 만드는 흔들림이 우리가 그은 선보다 컸다.

**DB `comment_analyses.confidence` 는 옛 파이프라인 것이므로 그대로 쓸 수 없다.** 5번 참조.

---

# 5. 저장 — 무엇이 있고 무엇이 없는가

## DB 는 이미 있다

프로젝트 규칙이 요구하는 **구조적 분리가 이미 만들어져 있다.**

```
raw_comments               원본 댓글. parent_youtube_comment_id 도 있음
raw_comment_payloads       유튜브 원본 응답
comment_analyses           AI 판단
sanitized_feedback         순화문          ← 별도 테이블
evidence_records           증거 기록
model_runs                 모델 호출. prompt_version · policy_version 있음
audit_logs                 감사 로그
deletion_audit_logs
moderation_action_requests 사용자 행동
creator_policies           분류 프로필
```

## 그런데 새 파이프라인은 여기에 쓰지 않는다

**저장 코드가 없다.** 그리고 `comment_analyses` 가 옛 파이프라인 모양이라 그대로 쓸 수도 없다.

| 테이블에 있는 것 | 새 파이프라인이 필요한 것 |
| --- | --- |
| `confidence: number` | `certainty: clear/borderline/unclear` |
| `toxicity`, `spam`, `phishing` | 쓰지 않는 개념 |
| `stage: number` | Luna / Terra 구분 |
| — | `basis` (확정 근거) |
| — | 검토 대기 상태 (등급이 null) |
| — | `hardRiskFlags` / `softRiskFlags` |
| — | 부모 댓글 연결 (raw_comments 엔 있음) |

## 겹침 주의

**옛 파이프라인이 지금도 이 테이블들을 쓰고 있고, 화면이 읽고 있다.** UI 작업이 인박스를 건드리면 `comment_analyses` 와 `sanitized_feedback` 을 읽는 코드에 닿는다.

두 갈래가 있다.

- **새 테이블을 따로 만든다** — 돌아가는 것을 건드리지 않고 옆에 짓는다. 한동안 두 벌이 공존하지만 충돌이 없다
- **`comment_analyses` 를 확장한다** — 깔끔하지만 옛 파이프라인·화면 작업과 정면으로 겹친다

**아직 정하지 않았다.** UI 작업이 DB 를 어디까지 건드리는지 확인하고 정하는 것이 맞다.

---

# 6. 안 되어 있는 것

## 6-1. 저장이 없다

위 5번. 지금은 `measurements/*.json` 에만 남는다.

## 6-2. 화면이 옛 파이프라인을 본다

인박스·대시보드·피드백이 모두 `features/analysis` 를 부른다. 새 파이프라인으로 갈아타는 작업이 그대로 남아 있다.

## 6-3. 유사 사례가 항상 비어 있다

```ts
similarExamples: []   // 지금 이렇게 넘어간다
```

프롬프트는 이것을 읽게 되어 있다 — "이 채널에서 이미 확정된 판단" 을 참고하라고. **그런데 채워 주는 코드가 없다.** RAG 검색이 새 파이프라인에는 아직 없다. (옛 폴더에 `rag-service.ts` 가 있지만 옛 계약이다.)

## 6-4. 분류 프로필이 기본값 고정이다

```ts
DEFAULT_CLASSIFICATION_PROFILE = {
  protectionLevel: "standard",
  allowedSlang: [],        // ← 비어 있다
  sensitiveTopics: [],
  ...
}
```

**`allowedSlang` 이 비어 있는 것이 실제로 문제를 만든다.** `아 개웃겨`, `ㅁㅊ 이걸 무료로 본다고?` 같은 **칭찬**이 주의로 분류되어 숨겨진다. 버그가 아니라 설정이 비어서 생기는 일이며, 기획서도 「신규 채널 콜드 스타트」로 미결 처리해 두었다.

`creator_policies` 테이블은 있으니 읽어 오는 경로와 설정 화면이 필요하다.

## 6-5. `safetyCase` 를 받는 곳이 없다

Terra 가 "작성자 본인이 힘들다고 털어놓는 경우" 를 표시하지만 아무도 처리하지 않는다. 기획서는 별도 큐에 넣고 등급 판정과 분리하라고 하며, **자동 알림이나 상담 자원 안내는 범위 밖**으로 명시했다. 잘못 작동하면 피해가 크므로 별도 설계가 필요하다.

## 6-6. 유튜브에서 실제 댓글을 받아 새 파이프라인으로 넣는 길이 없다

측정 스크립트는 `docs/test-comment-plan.md` 의 마크다운 표에서 읽는다. 유튜브 연동 자체는 있지만 옛 파이프라인으로 흐른다.

## 6-7. 답글 규칙 중 화면 쪽이 미정이다

부모 댓글 **한 단계**만 넘긴다. 아래는 정하지 않았고, 대부분 화면에서 답할 문제다.

```
스레드에 위험 답글이 하나 있으면 스레드 전체를 숨기는가, 그 답글만 숨기는가
부모가 위험일 때 악플을 말리는 답글을 어떻게 노출하는가
답글이 위험이면 부모 등급도 올리는가
주의 답글을 순화하면 대화 흐름이 깨지는 문제
```

---

# 7. 함정 모음

**한 번에 하나만 바꾸고 측정한다.** 후보 등급은 실행마다 흔들린다. 같은 댓글이 회차마다 다른 등급으로 나온 사례가 로드맵 10번에 여럿 기록돼 있다. 두 가지를 같이 바꾸면 무엇이 무엇을 움직였는지 알 수 없다.

**프롬프트를 고쳤으면 버전 상수를 올린다.** `LUNA_FIRST_PASS_PROMPT_VERSION`, `TERRA_VERIFICATION_PROMPT_VERSION`, `LUNA_REWRITE_PROMPT_VERSION`. 측정 JSON 에 찍혀서 두 결과를 비교할 때 어느 기준이었는지 알 수 있다.

**테스트 댓글을 프롬프트 예시로 넣지 않는다.** 답을 알려주고 시험 보는 것이 된다.

**프롬프트의 문장 하나가 판단을 통째로 바꾼다.** 실제로 겪은 것 둘.

- `unclear 는 정말 정할 수 없을 때만 쓴다` 한 줄 때문에 검토 대기가 11건에서 1건으로 줄었다. 정직한 답을 비용으로 그려 놓고 아끼라고 한 문장이었다
- `불만을 말하는 댓글에 ! 를 붙이지 않는다` 한 줄 때문에 순화문 21건 전부에서 문장부호가 사라졌다. 주의 댓글은 거의 전부 불만이기 때문이다

**기준 문서에 같은 내용이 여러 곳에 적혀 있다.** 요약본을 보고 프롬프트를 쓰면 조건이 빠진다. 실제로 「콘텐츠나 제작 능력을 거칠게 비판한다」 가 요약에서 빠져 있어 욕설 없는 거친 비판 8건이 전부 안전으로 새어 나갔다.

**템플릿 문자열 안에 백틱을 쓸 때 이스케이프한다.** 프롬프트가 통째로 깨지는데 타입 오류로는 안 잡힌다.

---

# 8. 확인하는 법

```bash
# 모델 없이. 분기와 확정 규칙 전부
npx vitest run src/features/classification

# 연결 확인. 1분, 몇 원
npx tsx scripts/measure-pipeline.ts 5

# 전 구간 90건. 20분, $0.05
npx tsx scripts/measure-pipeline.ts

# 결과를 읽기 좋은 한 장으로 (measurements/review.html)
npx tsx scripts/review-page.ts
```

테스트 댓글 90건은 [`docs/test-comment-plan.md`](./test-comment-plan.md) 의 표에서 읽는다. 댓글을 고치려면 그 문서를 고친다. `↳ A05` 표시가 부모 관계다.

**표에 적힌 기대 등급은 정답이 아니다.** 기준 문서를 읽고 붙인 짐작이며 팀이 검토해 합의한 값이 아니다. 결과가 다르다고 해서 틀린 것이 아니다.

---

# 9. 어디에 무엇이 적혀 있나

| 문서 | 내용 |
| --- | --- |
| [`comment-service-roadmap.md`](./comment-service-roadmap.md) | 기준 원본. 10번에 실측 기록 9회분 |
| [`test-comment-plan.md`](./test-comment-plan.md) | 테스트 댓글 90건과 검증 포인트 |
| [`classification/README.md`](../src/features/classification/README.md) | 돌려보는 방법, 열려 있는 문제 |
| 이 문서 | 붙일 때 알아야 할 것 |

**기준이 바뀌면 로드맵 문서를 고치고 같은 커밋에 코드와 프롬프트를 맞춘다.** 문서와 코드가 갈라지면 어느 쪽이 진짜인지 알 수 없게 된다.
