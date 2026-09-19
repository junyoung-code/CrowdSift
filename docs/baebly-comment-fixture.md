# 배블리 실제 댓글 fixture 검증 — 2026-09-13

사용자가 선택한 **쇼츠 포함 최신 업로드 순서로 200개가 될 때까지** 공개 댓글을 수집했다. YouTube Data API의 채널 uploads 목록으로 순서를 확인했다. 채널은 배블리[B.LOVELY MUKBANG], `UCHJPlIINqj9q8G2TBDickPg`다.

## 수집 범위

| 게시일 | 영상 | 최상위 | 답글 | 합계 |
| --- | --- | ---: | ---: | ---: |
| 2026-09-11 | [슈프림 치킨·싸이버거 브이로그](https://www.youtube.com/watch?v=v-pMBK6iSP0) | 65 | 39 | 104 |
| 2026-09-10 | [투뿔 한우 6종 먹방](https://www.youtube.com/watch?v=gQzC4zDF7zc) | 13 | 0 | 13 |
| 2026-09-09 | [트러플 간장찜닭](https://www.youtube.com/watch?v=yeiWPr6ViqQ) | 12 | 3 | 15 |
| 2026-09-04 | [제철 꽃게찜](https://www.youtube.com/watch?v=Qo0H_PSXOJI) | 16 | 1 | 17 |
| 2026-08-30 | [매운 등갈비찜 Q&A](https://www.youtube.com/watch?v=v_Z--xJCYPM) | 26 | 4 | 30 |
| 2026-08-29 | [탄수화물 먹방 브이로그](https://www.youtube.com/watch?v=f-CJQPjtdh8) | 20 | 1 | 21 |
| 합계 | 6개 영상 | **152** | **48** | **200** |

기존 `collectPublicComments`를 사용했다. 영상별 최신 최상위 스레드부터 부모와 최신 답글을 함께 선택한다. 댓글 전체를 게시 시각으로 정렬한 전역 최신순이나 무작위 표본은 아니다. 첫 다섯 영상은 수집 당시 공개 댓글을 전부 포함하고, 여섯 번째는 21개에서 잘랐다. 부모가 없는 답글, 중복 ID, 개수 불일치는 fixture schema가 거부한다.

## 실행 결과

실제 `createClassificationService`에 OpenAI 클라이언트와 파일 저장용 repository를 연결했다. **Moderation → Luna → 필요한 경우 Terra → 최종 판정 → 필요한 경우 순화**를 실행했다. 원문은 source 파일에, 모델 출력과 순화문은 live 파일의 별도 필드에 보존한다. DB 저장, Inbox 표시, YouTube moderation action은 이 측정의 범위가 아니다.

| 결과 | 개수 | 비율 |
| --- | ---: | ---: |
| 안전 | 175 | 87.5% |
| 주의 | 2 | 1% |
| 위험 | 3 | 1.5% |
| 판단 보류 | 20 | 10% |
| 처리 실패 | 0 | 0% |

- Terra 검증: 30개(15%). 즉시 안전: 170개. 순화: 2개, 모두 검사 통과.
- Moderation 실패 0개, 순화 실패 0개.
- 보류 이유: 위험 판단 불일치 13개, 은어 불확실성 4개, 문맥 부족 2개, 비꼼 불확실성 1개.
- 모델: `gpt-5.6-luna`, `gpt-5.6-terra`, `omni-moderation-latest`.
- 프롬프트: Luna v13, Terra v13, 순화 v4. 기본 공개 댓글 프로필, RAG 없음.
- 최종 표본 분석 시각: 2026-09-13 21:34:58–21:36:40 KST. 입력 1,120,440 / 출력 17,254 토큰(과금액이나 캐시 반영 수치는 아님).
- 저장한 응답으로 오프라인 재실행: **200개 모두 분기·최종 판정·순화 기록 일치**.

**사람이 합의한 정답 라벨이 없으므로 정확도 측정은 아니다.** live 1회 실행이며, replay 일치는 모델의 반복 실행 안정성도 뜻하지 않는다. replay는 고정 모델 응답에 대해 현재 서비스 코드의 분기·최종 판정을 다시 검증한다. 프롬프트 변경 효과는 새 live 실행이 필요하다.

## 검토할 발견

아래 번호는 `latest-source.json`의 1부터 시작하는 순서이며 검토 HTML에서도 동일하다. 평가는 코드 실행 기록과 원문을 읽은 Codex의 검토 의견이며 정답 라벨로 고정하지 않았다.

1. **외모·체중 칭찬의 과잉 판정 후보.** #87과 #160은 체중 감소를 언급하는 표현인데 두 모델 모두 외모 공격으로 보아 위험 확정했다. #31, #122, #142는 칭찬 의도로도 읽히지만 Luna 위험 / Terra 안전으로 보류됐다. 단순 언급과 인신공격의 구분을 우선 검토할 필요가 있다.
2. **사생활 단어에 대한 과민 반응 후보.** #41 결혼 축하 답글은 Luna가 칭찬 의도를 기록하면서도 사생활 언급을 개인 공격으로 분류했다. Terra는 안전이었고 최종 보류됐다. #7은 자신의 신혼여행 경험을 공유하며 크리에이터를 응원하는 내용인데 Terra가 개인 공격으로 분류했다.
3. **2차에서 해소한 모호함도 코드에서 보류 유지.** #15, #183은 두 모델 모두 안전 후보이지만 Luna의 `unclear_slang_polarity`가 최종 `ambiguous_slang`으로 남는다. `verdict.ts`의 `ambiguityBasis`가 양쪽 ambiguity 목록을 합치기 때문이다. 이는 실행 오류가 아니라 현재 규칙의 결과다. 보류를 줄이려면 정책 판단과 회귀 검증이 필요하다.
4. **친근한 말투와 비판의 경계.** #10은 말이 많다는 웃음 섞인 댓글을 두 모델 모두 주의로 보았다. 실제 영상의 분위기 없이 제목만 제공하므로 확정적인 오탐으로 단정하기 어렵다.
5. **유지할 대조 사례.** 화면 전환 불편(#17), 입을 닦아달라는 요청(#47), 가격 불만(#111), 필터 선호(#135), 거친 칭찬(#28, #51, #52)은 안전이었다. 출산을 재촉하며 채널 변경을 권하는 #186은 위험이었지만, 그 답글 #187은 안전이었다. 부모 등급을 답글에 그대로 전이하지 않았다.

위험 3개를 모두 악성 댓글의 정답으로 취급하면 안 된다. 이번 표본에서는 특히 정상 댓글의 과잉 보호를 살펴볼 재료가 확보됐다. 악성 댓글 재현율이나 전체 한국어 댓글 품질은 이 표본으로 결론 내릴 수 없다. 분류 코드와 프롬프트는 변경하지 않았다.

## 파일과 재실행

실제 원문과 작성자 메타데이터가 있으므로 데이터는 기존 Git 제외 경로 `measurements/baebly-2026-09-13/`에만 저장한다. 스크립트와 이 안내서는 Git으로 관리할 수 있다.

- `latest-source.json`: 최종 실제 원문 fixture와 원본 API payload.
- `latest-live.json`: 실제 모델 출력·분기·최종 판정·순화·실행 버전·fixture SHA-256.
- `latest-replay.json`: 외부 API 호출 없는 재실행 결과.
- `review.html`: 판정별 필터, 바로 표시되는 원문과 부모 문맥, 한국어로 풀어 쓴 단계별 판단과 최종 판정 이유, YouTube 출처.
- `review-notes.json`: 위험 댓글 3개의 원문·분류 신호·프롬프트를 대조한 Codex 검토 의견. AI 원본 결과와 별도로 보관하며 실행 기록의 SHA-256에 연결합니다. HTML 생성 명령의 마지막 인자로 전달하면 표시됩니다. 당시 모델이 직접 작성한 설명이나 확정 정답이 아닙니다.
- 초기 `source.json`, `live.json`은 답변 전 시작했다가 중단한 긴 영상 2개 기준 실험이다. **최종 결과에 포함하지 않는다.**

```bash
# 새 공개 댓글 snapshot: 결과 파일이 이미 있으면 원문 보호를 위해 실패한다.
NODE_OPTIONS=--conditions=react-server node --import tsx scripts/capture-public-comment-fixture.ts \
  measurements/baebly-new-source.json --total 200 \
  v-pMBK6iSP0 gQzC4zDF7zc yeiWPr6ViqQ Qo0H_PSXOJI v_Z--xJCYPM f-CJQPjtdh8

# 저장된 AI 응답으로 현재 분기/판정 검증: API 키·네트워크 불필요.
node --import tsx scripts/run-public-comment-fixture.ts \
  measurements/baebly-2026-09-13/latest-source.json measurements/baebly-replay-new.json \
  --replay measurements/baebly-2026-09-13/latest-live.json

# 프롬프트나 모델 변경 후 실제 AI 재분석: OPENAI_API_KEY 필요, API 비용 발생.
node --import tsx scripts/run-public-comment-fixture.ts \
  measurements/baebly-2026-09-13/latest-source.json measurements/baebly-live-new.json --live

# 새 실행 결과를 검토 페이지로 만들기.
node --import tsx scripts/report-public-comment-fixture.ts \
  measurements/baebly-2026-09-13/latest-source.json measurements/baebly-live-new.json \
  measurements/baebly-review-new.html
```

`--total`을 생략하면 지정한 영상마다 100개씩 가져온다. 입력 영상 순서는 자동 갱신되지 않으므로 새 시점의 최신 영상을 측정하려면 영상 ID를 새로 확인해야 한다. 실행 결과는 단계마다 파일에 기록한다. 출력 파일 덮어쓰기는 허용하지 않는다.

## V14 기준 비교

`context-evaluation.json`은 보류 20개의 Codex 제안 판정(안전 18, 주의 2)과 명시적으로 표시한 합성 대조 사례 6개다. 독립적인 사람이 확정한 정답이나 미사용 평가 세트가 아니다. 이전 `latest-live.json`과 `review.html`은 과거 실측 결과이며 새 기준의 품질 증명이 아니다.

```bash
# 아래 명령은 실제 API 비용이 발생한다. Astra는 사용하지 않는다.
OPENAI_TERRA_MODEL=gpt-5.6-terra node --import tsx scripts/run-classification-evaluation.ts measurements/baebly-2026-09-13/context-evaluation.json
OPENAI_TERRA_MODEL=gpt-5.6-luna node --import tsx scripts/run-classification-evaluation.ts measurements/baebly-2026-09-13/context-evaluation.json
```

2차 Luna를 선택하면 xhigh가 적용된다. 테스트 판정만 보고 기본 모델을 교체하지 말고, 다른 실제 악성 표본의 누락과 토큰 사용량도 함께 비교한다.
