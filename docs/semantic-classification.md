# 의미 분석 기반 댓글 분류

현재 경로는 `semantic-v1`이다. 수동 가져오기·공개 URL·채널 동기화·작업 재시도는 `processClassificationChunk`와 `runSemanticPipeline`을 공유한다. 미리보기와 파일 평가도 같은 정책/서비스를 사용한다. 모델 이름은 역할 설정으로만 전달한다.

## 계약과 정책

`semantic-contracts.ts`가 분석·claim·공격·재작성 계약이다. 분석 모델은 등급을 출력하지 않는다. 원문에 없는 evidence, 중복 ID, 존재하지 않는 잔존 ID는 분석 오류로 기록하고 재시도한다. 근거 문자열 검사는 의미적 정확성의 증명이 아니다.

정책 순서는 의미 복원 불가 HOLD → 관련 공격 없음 SAFE → 잔존 claim 있음 CAUTION → 나머지 RISK다. 부정적 의견은 공격이 아니다. 위협도 분리 가능한 피드백이 있으면 CAUTION이며, severity/criticalHarm은 별도다. 확인된 타인 공격과 스팸은 등급을 덮어쓰지 않는다. 타인 공격이 있는 SAFE도 원문을 가린다.

재작성은 CAUTION에만 적용한다. 생성 호출과 별도 검증 호출을 분리하고, 의미 검증 탈락은 사유와 함께 한 번 수정한다. 두 번 탈락하면 CAUTION과 실패 상태를 보존하며 원문·미검증 core를 대체 노출하지 않는다. 모델 출력 오류/API 오류는 HOLD가 아니다.

## 설정과 운영 활성화

`.env.example`의 아래 3개 모델은 모두 명시해야 한다. 기본 모델은 없다.

- `OPENAI_SEMANTIC_MODEL`, `OPENAI_SEMANTIC_REASONING_EFFORT`
- `OPENAI_FEEDBACK_REWRITE_MODEL`, `OPENAI_FEEDBACK_REWRITE_REASONING_EFFORT`
- `OPENAI_REWRITE_VALIDATION_MODEL`, `OPENAI_REWRITE_VALIDATION_REASONING_EFFORT`
- `SEMANTIC_INTERPRETATION_PROFILE` (`context-v1|context-v2|context-v3`)

추론 설정은 미지정하거나 해당 모델이 지원하는 `none|minimal|low|medium|high|xhigh`를 쓴다. SDK/API가 지원하지 않는 조합은 오류로 기록한다. 모델·추론·pipeline·프롬프트·스키마·정책 버전과 workspace 정책 버전으로 설정 키를 계산한다. 계약/프롬프트를 변경할 때 버전 상수도 올려야 한다.

개발 환경에서 live 비교가 가능하다. production은 사람 검수 live 평가를 통과한 설정의 `configurationKey`(정책 버전 1 기준)를 `SEMANTIC_APPROVED_CONFIGURATION`에 명시해야 실행된다. 이 값은 배포 담당자의 승인 기록이며 스스로 정확도를 증명하는 토큰은 아니다. 승인되지 않은 설정에서 구 Luna/Terra 경로로 자동 우회하지 않는다. fixture는 production에서 금지한다.

## 저장과 복구

- `semantic_snapshots`: 항목별 원문/제목/부모/적용 맥락/교정 이유 및 모델 설정의 불변 snapshot.
- `semantic_attempts`: 단계별 시도·성공/실패·모델/토큰/latency·원본 출력. 같은 설정의 성공 단계만 재사용.
- `classification_verdicts`: 등급·정책 근거·공개용 trace·재작성 상태. HOLD는 `review_queue + level=null`.
- `classification_rewrites`: 검증을 통과한 피드백만 저장. claim 보존 ID는 단계 출력에 보존.
- `classification_feedback`: 사용자 수정과 수정 이유/적용 맥락. 과거 등급만 있는 사례는 새 정답으로 사용하지 않음.

재작성 재시도는 분석을 재사용하고 과거 시도를 남긴다. audit의 `afterAttempts`에 단계별 최대 시도 번호를 기록해 새 cycle을 구분한다. 동일 시간의 DB transaction에서도 경계가 안정적이다. 중복 재시도는 상태 잠금으로 막는다.

미완료 구 작업은 `supersede_legacy_classification_job`으로 별도 작업/항목 ID에 옮긴다. 과거 성공 결과는 보존하고 구 작업의 재claim은 막는다. 완료된 과거 작업은 새 결과로 변환하지 않는다. 로컬 DB에서 기존 이력 `20260825113235`의 파일이 누락돼 있어 새 semantic migration 세 개만 별도 transaction으로 적용했다. 이 누락을 임의로 repair하지 않았다.

공개 목록의 semantic trace에는 근거 구절·coreMeaning·미검증 claim 내용을 넣지 않는다. 원문은 기존 경고 확인 경로에서 접근한다. 모든 신규 테이블은 workspace RLS와 서비스 전용 쓰기를 적용한다.

## 평가 실행

개발 사례 22건은 `src/evaluation/semantic-development-cases.json`에 있다. 제안 등급이며 사람 검수 표시가 없다. fixture 일치율은 파이프라인 테스트 결과일 뿐 실제 모델 품질이 아니다.

```sh
node --import tsx scripts/run-classification-evaluation.ts src/evaluation/semantic-development-cases.json --fixture --output measurements/semantic-fixture.json
node --import tsx scripts/run-classification-evaluation.ts DATASET.json --live --matrix MATRIX.json --split holdout --output measurements/semantic-live.json --release
node --import tsx scripts/run-classification-evaluation.ts DATASET.json --replay measurements/semantic-live.json --split holdout --output measurements/semantic-replay.json
node --import tsx scripts/run-classification-evaluation.ts DATASET.json --policy-only --output measurements/semantic-policy.json
```

각 설정은 3회 실행한다. 출력은 기존 파일을 덮어쓰지 않고 단계별 checkpoint를 원자적으로 저장한다. replay는 API/DB를 호출하지 않고 저장된 성공 단계를 검증한 뒤 정책을 다시 적용한다. 정책 버전이 바뀐 실험은 사람 검수 분석의 `--policy-only`를 사용한다. 이전 schema/prompt 설정의 stage를 새 설정으로 재사용하지 않는다. 저장된 모델 분석에 정책만 다시 적용하려면 `--policy-only --recording 기존평가보고서.json`을 사용한다.

MATRIX.json 형식(실제 모델 이름을 직접 입력):

```json
[{"name":"candidate-a","settings":{"provider":"live","analysis":{"model":"MODEL_A","effort":"high"},"rewrite":{"model":"MODEL_B","effort":null},"validation":{"model":"MODEL_C","effort":"high"}}}]
```

`--prices PRICES.json`은 모델별 `inputPerMillion`, `outputPerMillion`을 받아 추정 비용을 계산한다. 가격 미지정은 null로 표시한다. 공급자 할인/캐시 가격까지 확정 청구 비용을 계산하는 기능은 아니다. `--alignments REVIEWS.json`은 기록의 `rowDigest`에 묶인 검수자·claim 대응·재작성 검수를 받는다.

측정: 등급별 precision/recall·혼동 행렬·오류/HOLD 포함 정확도·RISK→SAFE·SAFE→RISK·CAUTION 누락·불필요한 HOLD·target/meaningClear/harm 정확도·claim 누락/추가/잔존 오류·재작성 검수·반복 일관성·토큰·latency·비용.

중간 분석 정답은 `goldAnalysis`에 계약 전체를 기록한다. claim은 ID 문자열을 비교하지 않는다. 내용과 원문 근거가 동일하면 자동 대응하고, 다른 표현은 사람의 대응 검수 전까지 `needsHumanAlignment=true`와 null 지표로 남긴다. 의미가 같은 바꿔 쓴 문장을 오답으로 계산하지 않는다. 검수 파일은 `AlignmentSchema`를 따른다. `rewriteText`까지 포함한 evaluation row의 SHA-256과 연결돼 다른 생성 결과에 재사용할 수 없다.

같은 스레드·유사 변형은 `group`을 공유한다. 실행기가 그룹/동일문/4자 shingle 유사도가 높은 문장의 개발/holdout 분할 누출을 거부한다. 자동 유사도 검사는 모든 의미적 유사성을 잡지 못하므로 그룹은 사람도 확인한다.

## 사람 검수

```sh
node --import tsx scripts/export-classification-evaluation.ts WORKSPACE_ID measurements/semantic-review
```

해당 workspace의 live 원문 최대 1,000건과 실제 제목·부모만 내보낸다. 기존 모델 등급은 정답으로 복사하지 않는다. 생성된 review.html에서 원문을 펼쳐 등급·판단 이유·검수자·중간 분석 JSON을 입력하고 `semantic-reviewed.json`을 저장한다. 모델별 표현이 달라 claim 대응이 보류된 건은 실행 결과를 대조해 별도 alignment 검수를 한다.

출시 기본 표본은 SAFE/CAUTION/RISK 각 100건 이상 + HOLD 30건 이상이며, 일부는 중간 분석 정답도 필요하다. 명확한 정상 의견에는 `clear_normal`, 순수 크리에이터 공격에는 `pure_creator_attack` 회귀 태그를 검수해서 남긴다. 3회 모두 세 등급 정확도 >95%, CAUTION/RISK recall ≥95%, 명확한 정상→RISK/순수 크리에이터 공격→SAFE 회귀 오류 0건이어야 한다. 분석 실패나 잘못된 HOLD를 분모에서 빼지 않는다.

```sh
SEMANTIC_EVALUATION_DATASET=DATASET.json SEMANTIC_EVALUATION_REPORT=measurements/semantic-live.json npm run test:eval:release
```

개발용 실제 댓글 111건과 사용자의 등급 108건에 대해 2026-09-18 Sol medium 분석·검증 / Terra low 재작성으로 1회 비교했다. 일치율 80.6% (87/108)이며 정식 사람 검수 holdout과 live A/B는 아직 수행하지 않았다. 운영 모델 선택·95% 달성·운영 활성화는 미완료다.

## 공개 댓글 파일 실험과 검증

### 개인 검수 등급과 1회 비교

`scripts/run-semantic-comparison.ts`는 명시한 모델로 새 의미 분석 파이프라인을 1회 실행하고, `comparison.json`과 읽기 쉬운 `comparison.html`을 단계마다 저장한다. 기본적으로 의미 분석·재작성·독립 검증에 같은 모델을 사용하며, `--rewrite-model`/`--rewrite-effort`와 `--validation-model`/`--validation-effort`로 역할별 설정을 지정할 수 있다. 사용자 등급은 모델에 전달하지 않는다. DB나 운영 모델 설정은 변경하지 않는다.

```sh
node --import tsx scripts/run-semantic-comparison.ts DATASET.json OUTPUT_DIRECTORY --model MODEL
# 중단 후 같은 입력·설정으로 성공한 단계를 재사용
node --import tsx scripts/run-semantic-comparison.ts DATASET.json OUTPUT_DIRECTORY --model MODEL --resume
```

상단 일치율은 사용자가 등급을 지정한 댓글만 비교하며 분석 실패는 분모에 포함한다. 진행 중에는 아직 끝나지 않은 댓글을 제외한 잠정값을 표시한다. 미분류 댓글도 분석하지만 일치율에는 넣지 않는다. 모델별 비교는 별도 출력 디렉터리로 실행한다. 이 1회 비교는 출시 평가의 3회 반복·사람 검수 정답 요건을 대체하지 않는다.

```sh
node --import tsx scripts/run-public-comment-fixture.ts SOURCE.json OUTPUT.json --fixture
node --import tsx scripts/run-public-comment-fixture.ts SOURCE.json OUTPUT.json --live
node --import tsx scripts/report-public-comment-fixture.ts SOURCE.json OUTPUT.json REVIEW.html
E2E_PORT=3107 npm run test:e2e -- e2e/public-youtube-read-only.spec.ts --project=chromium-1440
npm test
npm run db:test
npm run lint
npm run build
```

새 리포트는 원문/근거를 기본으로 접고 검증된 재작성만 먼저 보여준다. 과거 `public-comment-run-v1`은 읽기 전용 리포트를 지원한다. 이전 Luna/Terra 실험 스크립트와 관련 구현은 과거 기록/회귀 확인용이며 운영 import/preview/worker는 호출하지 않는다.

## 댓글 해석 경계 실험: context-v2 (2026-09-18)

운영 기본값과 과거 설정 식별자는 `context-v1`을 유지한다. `context-v2`는 사용자가 선택한 새 경계로, 단순 불만은 허용하면서 거친 콘텐츠 비하도 harm으로 추출한다. `target`은 주된 평가 대상, 각 `harms.target`은 실제 공격 대상이며 연결 이유는 `harms.content`에 남긴다. 새 필드나 추가 분석 호출은 없다.

### 의미 해석 상세 프로필: context-v3

2026-09-20 운영 선택은 Luna 역할 설정(분석 medium / 재작성 low / 검증 medium)과 `context-v3`다. production에서는 이 설정의 정확한 `configurationKey`가 `SEMANTIC_APPROVED_CONFIGURATION`과 일치할 때만 실행한다.

- 분석 호출 하나에서 `interpretation`을 먼저 출력한다: `addressees`, `speechActs`, `literalMeaning`, `impliedMeaning`, `missingContext`. 각 결론은 짧게 작성하며 긴 사고 과정은 요구하지 않는다.
- 대화 상대는 creator / parent_author / viewers / other / unknown. 평가 대상 `target`, 실제 공격 대상 `harms.target`과 독립적이다. 명시적인 상대 근거가 없으면 unknown을 허용한다.
- 발화 행위는 fact / question / suggestion / praise / defense / complaint / mockery / other이며 복합 발화를 허용한다. fact는 작성자의 사실 진술이지 외부 사실 검증이 아니다.
- 해석 근거는 `{source: comment | parent | title, quote}`이고 해당 입력에서 정확한 구절을 검증한다. 부모 없는 parent_author, 근거 없는 확정 상대, 지어낸 인용은 실패다. 기존 claim/harm 근거는 댓글 본문에 한정한다.
- `semantic-output-v2`는 새 필드를 필수로 요구한다. 기존 출력은 그대로 읽으며 자동 보충하지 않는다. v1/v2 설정 해시를 유지하고 v3는 새 분석 프롬프트·스키마 식별자로 분리한다.
- 공격 경계·정책·재작성 프롬프트는 v2와 같다. 문맥 부족·낮은 confidence·mockery 행위만으로 HOLD나 harm을 만들지 않는다. 핵심 의미 복원 불가에만 HOLD이며 해석 불가 이유와 필요한 정보가 필수다.
- 비교 결과에는 원래 번호를 `--presentation` JSON의 sourceNumbers로 전달할 수 있다. `{title,note,baselineLabel,sourceNumbers:{댓글ID:원래번호}}` 형식이며 모델 입력에는 전달하지 않는다.
- 완료 집계는 일치 + 불일치 + 평가 미확정 + 분석 실패 = 전체. 진행 중에는 분석 대기를 추가한다. 평가된 실패는 일치율 분모에 포함하고 미확정 등급은 제외한다.
- 보류 이유는 원문을 펼치지 않아도 표시한다. 상세 해석/근거는 유해 원문과 같은 보호 기준으로 접으며, 사람의 정답·교정 이유는 비교 모델에 보내지 않는다.

- 감다뒤·영포티 자막: 콘텐츠를 통해 제작자의 감각·나이를 조롱하는 의미를 확인한다. 인용·반박·자기 지칭을 구분한다.
- 거친 콘텐츠 비판: 사용자와 합의한 7·107·108번은 비하를 분리하고 시청 이탈·반복 불편·본론 진입 요청을 보존한다. 단순 취향이나 비속어만으로 공격을 만들지 않는다.
- 외모: 변화 관찰과 비하를 구분하고 공손하게 바꾼 외모 비하를 잔존 피드백으로 인정하지 않는다. 원문에 없는 촬영 구도·화장 개선을 생성하지 않는다.
- 문화·답글: 국가명 자체로 공격을 확정하지 않는다. 부모 주장에 실제 동조한 경우와 반박·옹호를 구분하고, 타인에게 향한 공격을 크리에이터에게 옮기지 않는다.

분류 결정표와 심각도 분리는 동일하다. 프로필은 분석·재작성·검증 프롬프트와 설정 식별자에 반영한다. CLI의 재개 검사는 이미 완료된 기록도 먼저 검사해 프로필·프롬프트·문맥이 다른 기록을 건너뛰어 재사용하는 일을 막는다.

```sh
node --import tsx scripts/run-semantic-comparison.ts \
  measurements/semantic-review-20260917/human-grades-context-v2-20260918.json \
  measurements/semantic-review-20260917/luna-context-v2-20260918 \
  --model gpt-5.6-luna --effort medium --rewrite-effort low --validation-effort medium \
  --profile context-v2 \
  --baseline measurements/semantic-review-20260917/luna-20260918/comparison.json \
  --original-dataset measurements/semantic-review-20260917/human-grades-20260918.json \
  --prices measurements/semantic-review-20260917/luna-prices-20260918.json
```

`--baseline`과 `--original-dataset`은 함께 지정한다. 댓글 ID·본문·제목·부모 문맥이 같아야 한다. `--prices`는 모델별 `inputPerMillion`, `outputPerMillion`의 USD 단가 JSON이며, 모르는 모델 단가나 누락된 사용량은 무료로 취급하지 않고 산출 불가로 표시한다. 비용은 기록된 사용량 × 일반 단가이며 캐시·전송 재시도까지 반영한 청구액은 아니다.

비교는 수정 후 등급 기준과 원래 등급 기준을 각각 보존한다. 이번 111건 중 최종 재검수가 필요한 10건은 기존 등급을 원본과 교정 메모에 보존하고 새 등급은 비워 둔다. 기존 미분류 3건과 합쳐 새 비교의 등급 분모는 98건이다. 사용자 이유가 확정된 교정만 review에 기록하고 중간 분석 goldAnalysis는 만들어 채우지 않는다.

`src/evaluation/semantic-context-development.json`은 22개 대조 사례로, 개발자가 구성한 기대 결과이며 사람 검수 정답이 아니다. 같은 스레드와 변형 사례는 모두 development에 유지한다. 프롬프트에 참고한 댓글의 일치율은 독립 평가 정확도나 출시 기준 달성을 의미하지 않는다.
