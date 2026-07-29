# CrowdSift Real Vertical Slice Design

- **Status:** Approved design
- **Date:** 2026-07-23
- **Primary target:** Desktop web
- **Korean version:** [2026-07-23-crowdsift-real-vertical-slice-design.ko.md](./2026-07-23-crowdsift-real-vertical-slice-design.ko.md)

## 1. Goal

Build the first real CrowdSift product slice:

```text
BrandBastion-inspired landing page
→ CrowdSift sign-in
→ connect one creator-owned YouTube channel
→ choose one video
→ import an initial batch of 20-50 real comments
→ run two-stage AI classification and creator personalization
→ store source and derived data separately
→ show real results in a creator dashboard and Comment Inbox
→ let the creator review, correct, and explicitly approve moderation actions
```

The initial 20-50 comments are a validation batch, not a product limit. The import architecture must support later pagination, larger syncs, and background execution without replacing the core domain interfaces.

## 2. Source Precedence

When requirements conflict, use this order:

1. `docs/product-context.md`
2. `docs/CrowdSift_Project_Context_v1.0.pdf`
3. `AGENTS.md`
4. `docs/codex-guides/`
5. `references/brandbastion/`

The concise product context and repository rules override the broader PDF MVP. Q&A Radar, Signal Digest, and the full Evidence Vault follow only after this slice works with real data.

## 3. Scope

### Included

- A complete desktop landing page with original CrowdSift branding and a visual standard inspired by BrandBastion.
- Supabase email magic-link authentication for the CrowdSift application session.
- A separate Google OAuth flow for YouTube access.
- Selection of one creator-owned YouTube channel when more than one eligible channel is available.
- Selection of one video from the connected channel.
- Initial import of 20-50 top-level comments and available replies.
- Idempotent storage of immutable source comments and source metadata.
- Creator policies, phrase rules, context exceptions, and preferred recommendations.
- Deterministic rules and a shared OpenAI model for first-pass classification.
- Same-creator feedback retrieval and second-pass contextual analysis.
- User-facing review levels: `안전`, `주의`, and `위험`.
- A real creator dashboard and Comment Inbox.
- Creator corrections stored separately from model output.
- Evidence preservation and explicit confirmation before an approved YouTube moderation action.
- Loading, empty, disconnected, partial-failure, permission, quota, retry, and success states.
- Unit, integration, browser, accessibility, and Korean evaluation coverage.

### Excluded

- Mobile-specific layouts and a mobile app.
- Instagram, TikTok, or other live platform integrations.
- Billing and pricing.
- Multi-channel simultaneous operation.
- Complex team roles.
- Q&A Radar.
- Signal Digest.
- The full Evidence Vault product area and evidence export.
- Complete analytics dashboards.
- Automatic replies.
- Automatic destructive moderation.
- Legal conclusions or legal-success predictions.
- Production fine-tuning or one fine-tuned model per creator.

## 4. Product Language

The interface uses these review levels:

| Stored value | Korean label | Meaning |
|---|---|---|
| `safe` | 안전 | Review priority is low because no material concern or policy conflict was found with sufficient confidence. This is not a legal or absolute safety guarantee. |
| `caution` | 주의 | Context, sarcasm, creator-specific language, mixed useful and abusive content, or lower confidence requires human attention. |
| `risk` | 위험 | Phishing, serious harassment, credible threat, severe abuse, or another high-priority signal requires prompt human review. |

Every comment remains stored and searchable. The default review queue shows `주의` and `위험` first. Color is never the only indicator; every level has text and an icon.

## 5. User Experience

### 5.1 Public landing page

Route: `/`

The page follows the information rhythm and visual quality of the saved BrandBastion references without copying its assets, source, text, logos, claims, customer logos, illustrations, statistics, or exact geometry.

Sections:

1. Header with CrowdSift identity, product navigation, sign-in, and primary CTA.
2. Large Korean hero copy beside a browser-style CrowdSift product preview based on `references/brandbastion/09-dashboard-hero-detail.png`.
3. Floating preview cards for imported comments, completed analyses, `주의`, `위험`, and an AI summary.
4. Three problem cards: creator exposure to harmful text, loss of useful feedback, and inconsistent manual decisions.
5. Three solution areas: safe triage, creator-specific moderation, and preservation of actionable feedback.
6. A two-stage AI analysis explanation.
7. A dark AI-processing section based on `references/brandbastion/06-ai-processing.png`.
8. A YouTube-first integration section that marks YouTube as supported and does not imply that other platforms are connected.
9. Final connection CTA.

The dashboard shown in the hero is explicitly labeled `제품 예시 화면`. Example values never share a production data path with authenticated dashboard data.

### 5.2 CrowdSift sign-in

Route: `/auth/sign-in`

The application session uses Supabase email magic-link authentication. YouTube authorization remains a separate step so the user can sign in to CrowdSift without granting YouTube access and can revoke YouTube access without losing the CrowdSift account.

### 5.3 YouTube connection

Route: `/app/connect/youtube`

Flow:

1. The signed-in user starts Google OAuth.
2. The server validates OAuth state and exchanges the authorization code.
3. CrowdSift loads creator-owned channels available to the authorized identity.
4. If one channel is available, it is preselected and confirmed.
5. If multiple channels are available, the user selects exactly one.
6. CrowdSift stores channel metadata and encrypted tokens.
7. The user can disconnect, reconnect, or recover from revoked access.

Initial import uses the minimum read scope. When the user first chooses an actual hide, reject, or delete action, the product requests the additional moderation scope through incremental authorization.

Stored channel information is limited to what the product needs: channel ID, title, handle or URL when available, thumbnail, ownership/connection status, authorized scopes, and synchronization timestamps.

### 5.4 Video selection and import

Route: `/app/videos`

The user sees recent videos for the selected channel, selects exactly one, and chooses an initial import size between 20 and 50. Import progress shows requested, fetched, stored, skipped-as-duplicate, and failed counts.

The first slice supports a validation batch. The service boundary accepts page tokens and limits so later work can add `더 가져오기`, scheduled synchronization, and background processing without changing UI consumers.

### 5.5 Creator dashboard

Route: `/app`

Only real persisted data appears after authentication.

Top cards:

- imported comments
- completed analyses
- `주의`
- `위험`

Main content:

- connected channel and connection health
- selected video and last successful import
- import and analysis progress
- real `안전 / 주의 / 위험` distribution
- prioritized `주의` and `위험` comments
- recent creator corrections and moderation actions
- Comment Inbox CTA
- AI summary only when sufficient real analysis data exists

The disconnected dashboard replaces metrics with a YouTube connection prompt. It never shows example values as connected results.

### 5.6 Comment Inbox

Route: `/app/inbox`

The Inbox is denser and quieter than the marketing page.

Capabilities:

- default `검토 필요` queue containing `주의` and `위험`
- `안전 / 주의 / 위험` filters
- category, video, analysis state, action state, and confidence filters
- search over permitted source and derived fields
- sanitized feedback displayed before harmful source text
- explicit warning interaction before revealing harmful source text
- detail panel separating source, deterministic signals, AI analysis, creator-policy matches, retrieved examples, and creator decision
- controls to correct category, review level, recommended action, and sanitized feedback
- explicit moderation confirmation
- evidence and audit history

## 6. Application Architecture

Use one Next.js 16 App Router application with focused server-only modules.

```text
React UI
→ Server Action or Route Handler
→ domain service
   ├── application authentication
   ├── YouTube authorization and ingestion
   ├── deterministic rules
   ├── first-pass AI classification
   ├── creator feedback retrieval
   ├── second-pass contextual analysis
   ├── creator review
   ├── moderation execution
   └── evidence and audit recording
→ Supabase Postgres
```

External SDKs must not be called from React components. Services expose application-owned types so Google, OpenAI, or storage implementations can change without rewriting UI components.

Imports and analyses persist job state even when initially executed in the web application process. A future background worker consumes the same job records and service interfaces.

## 7. Data Boundaries

Every tenant-owned row includes `workspace_id`. The first slice creates one owner workspace per user, while the schema keeps workspace ownership explicit for later team support.

### 7.1 Identity and connection

- `profiles`: application user profile linked to Supabase Auth.
- `workspaces`: tenant boundary and creator settings.
- `workspace_members`: owner membership; additional roles are not exposed in this slice.
- `youtube_connections`: encrypted access and refresh token data, scopes, status, and expiry.
- `youtube_channels`: selected source channel metadata.
- `youtube_videos`: imported source video metadata.

### 7.2 Source ingestion

- `comment_import_jobs`: requested limit, page cursor, status, counts, retry data, and timestamps.
- `raw_comments`: stable YouTube identifiers, parent relationship, author metadata when available, immutable displayed/original text, timestamps, moderation status when available, captured time, import job, and source deletion marker.
- `raw_comment_payloads`: preserved API payload associated with the immutable source record.

The unique source key is:

```text
workspace_id + youtube_comment_id
```

Sanitized text and AI output never update `raw_comments`.

### 7.3 Creator policy

- `creator_policies`: category sensitivities, default recommendations, harmful-text visibility preference, version, and timestamp.
- `phrase_rules`: blocked phrases, allowed phrases, context exceptions, normalized matching form, enabled state, and version.
- `rule_evaluations`: per-comment matched rules, deterministic signals, and rule-engine version.

A blocked phrase is a signal, not a final destructive decision. Allowed phrases and context exceptions can alter routing but cannot execute a moderation action.

### 7.4 AI and personalization

- `analysis_jobs`: batch analysis lifecycle and counts.
- `model_runs`: provider, model identifier, prompt version, schema version, policy version, latency, usage, status, and error metadata.
- `comment_analyses`: category, confidence, review level, toxicity, spam and phishing probabilities, actionable-feedback flag, recommendation, manual-review flag, explanation, and provenance identifiers.
- `sanitized_feedback`: derived neutral feedback or an explicit no-signal result linked to an analysis.
- `creator_feedback`: creator approval, rejection, corrected fields, edited sanitized feedback, and consent flags.
- `feedback_embeddings`: embedding vector, source feedback, embedding model, and deletion state.
- `evaluation_cases`: separate reviewed Korean fixtures and expected outcomes.

Personalization consent and future training consent are separate:

- `use_for_personalization` permits same-workspace retrieval.
- `use_for_training` only marks a future training candidate and does not upload or train anything.

### 7.5 Actions, evidence, and audit

- `moderation_action_requests`: requested action, target, actor, confirmation timestamp, idempotency key, execution state, result, and error.
- `evidence_records`: immutable source snapshot and available metadata captured before an action.
- `audit_logs`: actor, event type, target reference, timestamp, and non-sensitive event metadata.

## 8. Two-Stage Analysis

### 8.1 Stage 0: preserve source

Store the raw comment and available source metadata before classification. Never log or persist a sanitized sentence in place of source text.

### 8.2 Stage 1: fast classification for every comment

Inputs:

- immutable source comment
- video title and permitted source context
- deterministic rule results
- current creator policy summary

Outputs:

- explicit category
- confidence
- initial `안전 / 주의 / 위험`
- toxicity, spam, and phishing signals
- actionable-feedback flag
- second-pass decision and reasons

The explicit category set is:

```text
positive
neutral
question
constructive_feedback
toxic_but_actionable
abusive_no_signal
spam_advertisement
phishing
harassment
threat_or_serious_risk
uncertain
```

### 8.3 Creator feedback retrieval

Create a query embedding and search only the current workspace's enabled `use_for_personalization` examples. Return at most five approved or corrected examples and record every retrieved identifier and similarity score.

The initial similarity trigger is `0.78`. Store it in versioned analysis configuration so evaluation can revise it without rewriting historical results.

### 8.4 Stage 2: contextual analysis

Run the second pass when any condition is true:

- Stage 1 returns `주의` or `위험`.
- Stage 1 confidence is below `0.85`.
- A blocked, allowed, or context-exception rule matches.
- A creator-feedback example has similarity at or above `0.78`.
- The comment mixes abuse with potentially useful feedback.
- The comment contains sarcasm, quotation, slang, spacing variants, or another context-sensitive pattern.

Inputs:

- immutable source and available thread/video context
- Stage 1 result and deterministic signals
- current creator policy and phrase-rule versions
- at most five same-workspace feedback examples

Outputs:

- final category and confidence
- final `안전 / 주의 / 위험`
- supported sanitized feedback or `null`
- normalized question or `null`
- recommended action
- manual-review and evidence-review flags
- creator-facing explanation
- rule, feedback, policy, model, prompt, and schema provenance

The second pass may change the Stage 1 result but must preserve both runs.

### 8.5 Creator review

A creator correction creates a new `creator_feedback` row. It never mutates the raw comment or historical analysis. A future analysis can retrieve an approved correction when `use_for_personalization` is enabled.

## 9. Moderation Actions

The system recommends but does not automatically execute destructive actions.

Required sequence:

```text
load source and current state
→ create evidence record
→ show action and consequence
→ receive explicit creator confirmation
→ ensure required OAuth scope
→ call supported YouTube method
→ record success or failure
→ append audit event
```

Supported action requests may include hide/reject/delete only when the current official YouTube API and granted scope support the exact operation. If scope is missing, the action starts incremental authorization rather than failing silently.

Deleting or rejecting a source comment never deletes the stored original. If the source later disappears, set `source_deleted_at` and preserve prior analysis and action history.

## 10. Security and Privacy

- Keep all secrets and provider tokens server-side.
- Encrypt Google tokens at rest with a server-side encryption key separate from the database.
- Validate OAuth state and callback origin.
- Request the minimum scope and use incremental authorization.
- Never expose Supabase service-role credentials to the browser.
- Enable RLS on every exposed tenant table.
- Test same-workspace access and cross-workspace denial.
- Avoid logging raw harmful text, provider tokens, authorization codes, or API keys.
- Disconnect revokes or deletes stored token material and stops synchronization.
- Disconnect does not silently delete imported data.
- A separate confirmed workspace-data deletion removes source, analyses, embeddings, and derivatives; retain only a content-free deletion audit event.
- Do not make legal conclusions.

## 11. Reliability and Error Handling

Import and analysis job states:

```text
pending
running
partially_succeeded
succeeded
failed
```

Per-item state prevents one failed comment from discarding successful work.

Retry transient network, provider `5xx`, and rate-limit responses up to three times with exponential backoff. Do not automatically retry invalid requests, revoked permission, missing scope, or exhausted quota without a state change.

User-visible states:

- disconnected
- connected
- empty channel or video
- comments disabled
- import pending/running/partial/failed/succeeded
- analysis pending/running/partial/failed/succeeded
- expired or revoked Google authorization
- missing moderation scope
- YouTube quota exhaustion
- OpenAI rate limit or schema failure
- retryable and non-retryable errors

The analysis idempotency key is based on:

```text
raw_comment_id
+ creator_policy_version
+ prompt_version
+ model_version
+ schema_version
```

Historical model runs remain queryable after reanalysis.

## 12. Visual and Accessibility Requirements

- Primary desktop validation sizes: `1440x900` and `1280x800`.
- Mobile-specific navigation, tables, drawers, and acceptance checks are deferred.
- Landing page: large type, generous spacing, restrained motion, visual explanation.
- Dashboard and Inbox: denser information, minimal motion, efficient repeated review.
- Harmful source text is hidden by default.
- All main flows are keyboard operable.
- Interactive controls have visible focus and accessible names.
- Text and controls meet applicable WCAG AA contrast.
- Status never depends on color alone.
- Respect `prefers-reduced-motion`.
- Do not copy BrandBastion assets, wording, customer evidence, source code, or exact layout.

## 13. Testing Strategy

### Unit tests

- phrase normalization and blocked/allowed/context rules
- repetition, URL, spam, and phishing signals
- initial review-level routing
- second-pass trigger conditions
- sanitization does not invent useful meaning
- raw comments are immutable
- creator correction remains separate
- idempotency-key construction

### Integration tests

- Supabase Auth application boundary
- OAuth state and server-only token handling
- one-channel selection
- import pagination and 20-50 limit
- source uniqueness and repeated imports
- partial import and analysis failures
- structured-output runtime validation
- policy/model/prompt/schema versioning
- RLS and cross-workspace denial
- same-workspace-only RAG
- evidence-before-action ordering
- confirmation-before-action enforcement

### Browser tests

```text
landing
→ sign in
→ disconnected dashboard
→ YouTube authorization
→ channel confirmation
→ video selection
→ 20-50 comment import
→ analysis progress
→ real dashboard
→ Inbox filters
→ hidden-source reveal warning
→ creator correction
→ confirmed moderation request
```

Automated tests mock Google, YouTube, and OpenAI. A separate manual test uses a real creator-controlled channel and real credentials.

### Korean evaluation set

Maintain at least 60 human-reviewed cases covering:

- positive and neutral comments
- questions
- constructive criticism
- toxic but actionable feedback
- pure abuse
- sarcasm and indirect attacks
- creator-specific friendly slang
- Korean spacing and repeated-character variants
- advertisement, repetition, and phishing
- harassment and threats
- ambiguous comments

Evaluation data stays separate from production comments and is not automatically used for training.

## 14. Release Gates

The slice is not complete unless:

- raw source mutation count is zero
- cross-workspace source or RAG leakage count is zero
- moderation actions without explicit confirmation count is zero
- fabricated useful feedback from pure-abuse evaluation cases is zero
- clearly risky evaluation cases classified as `안전` is zero
- structured responses pass runtime schema validation initially or after one retry
- repeated source imports create zero duplicate raw-comment rows
- disconnected screens show zero fake connected metrics
- a real channel, video, and 20-50 comment import is manually verified
- dashboard and Inbox show the same persisted real records
- `npm test`, `npm run lint`, and `npm run build` pass

## 15. External Prerequisites

- Supabase project and configured authentication.
- Google Cloud project with YouTube Data API enabled.
- OAuth consent screen, client credentials, and authorized callback URLs.
- Google verification or YouTube compliance work when required for production scopes or quota.
- OpenAI API access and server-side key.
- Deployment environment variables.

## 16. Future Work

After this slice is verified:

1. larger and scheduled imports
2. background workers
3. Q&A Radar
4. Signal Digest
5. full Evidence Vault and export
6. expanded creator evaluation and cost controls
7. mobile-specific product design
8. additional platforms

Fine-tuning is not a dependency or promised capability. Reconsider a shared tuned model only if a provider supports it, consented representative data exists, and held-out Korean evaluation demonstrates a measurable improvement over the shared base model plus policy, rules, and retrieval.
