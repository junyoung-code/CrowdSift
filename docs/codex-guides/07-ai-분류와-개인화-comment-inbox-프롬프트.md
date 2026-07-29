# AI 분류와 개인화·Comment Inbox 프롬프트

## 문서 목적

실제 YouTube 댓글을 공통 AI 모델로 분석하고, 크리에이터별 정책·규칙·과거 피드백을 결합해 개인화된 추천을 만든다. 분석 결과를 별도 저장하고 실제 Comment Inbox에서 검토·수정할 수 있게 한다.

## 적용 시점

6번에서 실제 댓글 가져오기가 검증됐고 OpenAI API 키가 서버 환경에 준비됐을 때 사용한다. 이 단계에서는 실제 Fine-tuning 작업을 수행하지 않는다.

## 개인화 판단 순서

```text
원본 댓글 보존
→ 결정적 규칙 검사
→ 크리에이터 정책 불러오기
→ 같은 크리에이터의 유사 피드백 검색
→ 공통 OpenAI 모델 분석
→ 개인화된 추천 생성
→ 크리에이터 검토·수정
→ 수정 이력을 다음 분석과 평가 데이터 후보로 저장
```

## 복사용 영문 프롬프트

```text
Implement the approved AI classification, creator personalization, feedback retrieval, and real Comment Inbox milestone for CrowdSift.

Use the official OpenAI JavaScript/TypeScript SDK through a server-only service boundary. Verify current official model and API guidance at implementation time instead of hard-coding an undocumented or deprecated model. Do not implement model fine-tuning in this milestone.

Preserve the working YouTube connection and imported source records. Use docs/product-context.md and AGENTS.md as the source of truth.

Implement the analysis pipeline in this order:

1. Load the immutable raw comment and its source context.
2. Evaluate deterministic phrase, URL, repetition, and explicit spam rules.
3. Load the current creator policy and its version.
4. Retrieve a small set of semantically relevant, consent-eligible feedback examples from the same creator only.
5. Call the shared OpenAI model with the base policy, creator policy, deterministic signals, source context, and retrieved examples.
6. Validate the structured response at runtime.
7. Store the model result, sanitized feedback, recommendation, provenance, and versions separately from the raw comment.
8. Display the real result in Comment Inbox.
9. Capture creator approval, rejection, corrected category, corrected recommendation, edited sanitized feedback, and learning consent as a separate feedback record.

The creator policy must support:

- blocked phrases
- allowed phrases and context exceptions
- sensitivity by category
- preferred recommendation by category
- whether harsh but actionable feedback should be preserved
- whether original harmful text remains hidden by default
- policy version and update timestamp

A blocked phrase is a signal, not an automatic final judgment. Handle Korean spacing variants, repeated characters, slang, quoted language, friendly channel-specific usage, and context. Deterministic rules may route a comment to review but must not automatically perform a destructive action.

Return a validated structured analysis containing at least:

- category
- confidence
- toxicity level
- spam probability
- phishing probability
- contains actionable feedback
- sanitized feedback or null
- normalized question or null
- recommended action
- manual review required
- evidence review recommended
- creator-facing explanation
- matched rule identifiers
- retrieved feedback example identifiers
- creator policy version
- model identifier
- prompt version
- schema version
- analysis timestamp

Use an explicit category set that covers positive, neutral, question, constructive feedback, toxic but actionable, abuse without useful signal, spam or advertisement, phishing, harassment, serious threat or risk, and uncertain.

Sanitized feedback requirements:

- Remove profanity, ridicule, personal attacks, and irrelevant abuse.
- Preserve only meaning that is present in the source.
- Do not invent a useful signal when none exists.
- Preserve uncertainty when the meaning is ambiguous.
- Never overwrite the original comment.
- Keep the original harmful text hidden by default and reveal it only through an explicit warning action.

Creator-specific feedback retrieval requirements:

- Search only feedback owned by the current creator or workspace.
- Prefer creator-approved examples with clear corrected labels.
- Exclude examples without learning consent from future training datasets.
- Do not place all historical feedback into every prompt; retrieve only a small relevant set.
- Record which examples influenced each analysis.
- Prevent cross-tenant retrieval in database policies and tests.

Comment Inbox requirements:

- Show real imported comments and real analysis status.
- Support search, category and status filters, confidence display, recommended action, sanitized feedback, manual review, and correction controls.
- Make source, rule result, AI analysis, creator preference match, and final creator decision distinguishable.
- Show pending, processing, succeeded, failed, uncertain, and needs-review states.
- Never display fixtures or demo counts as connected results.
- Require explicit confirmation before hide, reject, or delete.
- Preserve evidence and record the action request, actor, result, timestamp, and error before or during any approved moderation workflow.

Reliability requirements:

- Make analysis jobs idempotent by source comment, policy version, prompt version, and model version.
- Support retries and partial failures without duplicating analyses.
- Keep API keys server-side.
- Avoid logging raw harmful content unless required for a documented operational purpose.
- Send low-confidence and high-risk results to manual review.
- Do not make legal conclusions.

Evaluation and future fine-tuning preparation:

- Create a representative Korean evaluation fixture covering slang, spacing variants, sarcasm, indirect insults, advertising, phishing, repeated comments, constructive criticism, toxic-but-actionable comments, pure abuse, serious threats, and ambiguous comments.
- Keep evaluation data separate from production comments.
- Track creator consent before a feedback item can become a training candidate.
- Separate training and held-out evaluation datasets.
- Record dataset version, source provenance, anonymization status, consent status, and deletion status.
- Do not upload data or start a fine-tuning job.
- Document that a future shared fine-tuned model may be considered only if it measurably improves the held-out evaluation set over the shared base model plus creator policy and retrieval.
- Do not create one large model per creator. Creator-specific behavior must remain in policies and retrieved feedback unless a separate enterprise decision is approved.

Add tests to verify:

- constructive criticism is not removed automatically
- toxic but useful comments retain only supported actionable meaning
- pure abuse does not produce fabricated feedback
- creator policies can produce different recommendations for the same phrase
- allowed phrases can override a blocked-term signal without bypassing manual review rules
- retrieval never crosses tenants
- feedback corrections are stored separately
- raw comments remain unchanged
- repeated analysis is idempotent
- prohibited legal conclusions are absent
- destructive actions require explicit confirmation

Run:

- npm test
- npm run lint
- npm run build

At completion, report the analysis schema, policy schema, retrieval strategy, data separation, consent flow, model and prompt versioning, evaluation results, known Korean classification limitations, and the remaining evidence or fine-tuning work.
```

## 완료 기준

동일한 댓글도 크리에이터 정책과 승인된 과거 사례에 따라 다른 추천을 받을 수 있어야 한다. 모든 판단 근거와 버전을 추적할 수 있고, 원본은 변하지 않으며, 사용자가 결과를 수정하면 별도 피드백으로 저장돼야 한다.

마지막으로 [8. 가장 중요한 수정점](./08-가장-중요한-수정점.md)을 확인한다.
