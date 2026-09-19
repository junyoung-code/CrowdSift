# Claude 의미 분석 테스트 연결

Claude는 로컬 비교 실행기의 의미 분석에만 선택할 수 있다. 운영 수집·Inbox 기본 설정은 바뀌지 않는다. API 키를 저장하거나 provider를 생성하는 것만으로 분석 요청이 발생하지 않는다.

## 환경 설정

프로젝트 `.env.local` 또는 `.env`에 `ANTHROPIC_API_KEY`를 저장한다. 재작성·검증에는 기존 `OPENAI_API_KEY`를 사용한다. 여러 Anthropic workspace에 연결된 키라서 API가 workspace를 요구하는 경우에만 `ANTHROPIC_WORKSPACE_ID`를 추가한다. 키는 결과 snapshot에 저장하지 않는다.

## 나중에 분석을 실행할 때

아래 명령은 실제 비용이 발생하는 분석 실행 명령이다. 연결 코드 추가만 요청한 현재 단계에서는 실행하지 않았다.

```sh
node --import tsx scripts/run-semantic-comparison.ts \
  measurements/semantic-review-20260917/human-grades-context-v2-20260918.json \
  measurements/semantic-review-20260917/sonnet-context-v2 \
  --analysis-provider anthropic --model claude-sonnet-5 --effort medium \
  --rewrite-model gpt-5.6-luna --rewrite-effort low \
  --validation-model gpt-5.6-luna --validation-effort medium \
  --profile context-v2 \
  --baseline measurements/semantic-review-20260917/luna-context-v2-20260918/comparison.json \
  --original-dataset measurements/semantic-review-20260917/human-grades-context-v2-20260918.json
```

- 분석: Sonnet의 Messages API + structured outputs. 기존 프롬프트·문맥·출력 계약을 그대로 사용한다. 모델 접근 권한은 실제 호출 전에는 확인되지 않는다.
- 추론: adaptive, effort는 low/medium/high 지원. 출력 상한은 thinking 포함 4,096 tokens. 상한 초과·거절·형식 오류는 분석 실패이며 HOLD로 바꾸지 않는다.
- CAUTION 재작성과 독립 검증: OpenAI 모델을 명시적으로 지정한다.
- 설정 식별자에는 Anthropic 제공자와 어댑터 버전·토큰 상한·thinking 설정이 포함된다. 기존 OpenAI 설정 식별자는 유지된다.
- Claude 자동 재시도는 0회다. 실패 응답이 있을 때도 토큰 사용량을 보존하며, 분석 실패는 기존 실패 기록 경로로 저장한다.
- 비교 파일은 별도 디렉터리에 저장한다. DB와 기존 Luna 결과는 수정하지 않는다. 토큰 사용량은 기록되며, 비용을 계산하려면 실제 응답 모델 ID를 키로 한 `--prices` JSON을 제공한다. 가격표가 없으면 비용을 추측해서 표시하지 않는다.
- 프롬프트 캐싱은 요청하지 않는다. 현재 가격 계산은 일반 입력·출력 단가를 사용하며 캐싱 할인 계산은 지원하지 않는다.

연결용 예시 문장 하나만 분석하려면 `node --import tsx scripts/check-anthropic-semantic.ts --model claude-sonnet-5 --effort medium`을 사용할 수 있다. 이 명령도 실제 API 요청 1회이며 자동으로 실행되지 않는다. 예시 결과는 품질 평가 데이터가 아니다.

API 형식 참고: [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [Effort](https://platform.claude.com/docs/en/build-with-claude/effort).
