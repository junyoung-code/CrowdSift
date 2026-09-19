# 의미 분석 기반 댓글 분류

현재 실행 경로는 `semantic-v1`이다.

댓글/문맥 → SemanticAnalyzer → 계약 검증 → ClassificationPolicy → CAUTION FeedbackRewriter → 별도 RewriteValidator → 저장/Inbox.

- 계약: `semantic-contracts.ts`
- 명시적 정책: `semantic-policy.ts`
- 단계 실행/복구: `semantic-service.ts`, `semantic-repository.ts`
- 모델 역할/추론/버전 설정: `semantic-settings.ts`, `semantic-openai.ts`
- 서비스 worker: `process-classification-job.ts`
- 평가: `src/evaluation/semantic-evaluation.ts`, `scripts/run-classification-evaluation.ts`

[실행·복구·검수·출시 기준](../../../docs/semantic-classification.md)과 [구현 체크리스트](../../../docs/plans/2026-09-16-semantic-classification-progress.md)를 참고한다.

Luna/Terra 및 기존 classification/analysis 파일은 이전 기록과 회귀 호환용이다. 새 실행 경로는 모델의 직접 등급 판정이나 Moderation 강제 상승을 호출하지 않는다. 모델 기본값을 정하지 않았으며 사람 검수 live 평가 전에는 실제 정확도 목표를 달성했다고 표시하지 않는다.
