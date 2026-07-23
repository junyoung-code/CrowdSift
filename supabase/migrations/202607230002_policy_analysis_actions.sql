create type public.review_level as enum ('safe', 'caution', 'risk');

create type public.comment_category as enum (
  'positive',
  'neutral',
  'question',
  'constructive_feedback',
  'toxic_but_actionable',
  'abusive_no_signal',
  'spam_advertisement',
  'phishing',
  'harassment',
  'threat_or_serious_risk',
  'uncertain'
);

create type public.moderation_action as enum (
  'hold_for_review',
  'publish',
  'reject',
  'delete'
);

create type public.action_state as enum (
  'pending_confirmation',
  'awaiting_scope',
  'running',
  'succeeded',
  'failed',
  'cancelled'
);

create type public.recommended_action as enum (
  'none',
  'review',
  'hold_for_review',
  'publish',
  'reject'
);

create type public.rule_kind as enum (
  'blocked',
  'allowed',
  'context_exception'
);

create table public.creator_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version integer not null check (version > 0),
  category_sensitivity jsonb not null default '{}',
  preferred_actions jsonb not null default '{}',
  harmful_text_hidden boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, version)
);

create table public.phrase_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  policy_id uuid not null
    references public.creator_policies(id) on delete cascade,
  kind public.rule_kind not null,
  phrase text not null check (length(trim(phrase)) > 0),
  normalized_phrase text not null check (length(trim(normalized_phrase)) > 0),
  context_note text,
  enabled boolean not null default true,
  version integer not null check (version > 0),
  created_at timestamptz not null default now()
);

create table public.rule_evaluations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  raw_comment_id uuid not null
    references public.raw_comments(id) on delete cascade,
  policy_version integer not null check (policy_version > 0),
  rule_engine_version text not null,
  normalized_text text not null,
  signals jsonb not null,
  initial_review_level public.review_level not null,
  created_at timestamptz not null default now(),
  unique (raw_comment_id, rule_engine_version, policy_version)
);

create table public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  import_job_id uuid
    references public.comment_import_jobs(id) on delete set null,
  configuration_key text not null,
  status public.job_status not null default 'pending',
  total_count integer not null default 0 check (total_count >= 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (import_job_id, configuration_key)
);

create table public.analysis_job_items (
  id uuid primary key default gen_random_uuid(),
  analysis_job_id uuid not null
    references public.analysis_jobs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  raw_comment_id uuid not null
    references public.raw_comments(id) on delete cascade,
  status public.item_status not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (analysis_job_id, raw_comment_id)
);

create table public.model_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  raw_comment_id uuid not null
    references public.raw_comments(id) on delete cascade,
  analysis_job_item_id uuid
    references public.analysis_job_items(id) on delete set null,
  stage smallint not null check (stage in (1, 2)),
  provider text not null,
  model_identifier text not null,
  provider_response_id text,
  idempotency_key text not null unique,
  prompt_version text not null,
  schema_version text not null,
  policy_version integer not null check (policy_version > 0),
  latency_ms integer check (latency_ms >= 0),
  usage jsonb not null default '{}',
  status text not null check (status in ('succeeded', 'failed', 'refused')),
  error_code text,
  created_at timestamptz not null default now()
);

create table public.comment_analyses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  raw_comment_id uuid not null
    references public.raw_comments(id) on delete cascade,
  analysis_job_item_id uuid
    references public.analysis_job_items(id) on delete set null,
  model_run_id uuid not null unique
    references public.model_runs(id) on delete restrict,
  rule_evaluation_id uuid
    references public.rule_evaluations(id) on delete set null,
  stage smallint not null check (stage in (1, 2)),
  stage_one_analysis_id uuid
    references public.comment_analyses(id) on delete restrict,
  category public.comment_category not null,
  confidence real not null check (confidence between 0 and 1),
  review_level public.review_level not null,
  toxicity real not null check (toxicity between 0 and 1),
  spam real not null check (spam between 0 and 1),
  phishing real not null check (phishing between 0 and 1),
  actionable_feedback boolean not null,
  recommended_action public.recommended_action not null,
  manual_review boolean not null,
  evidence_review boolean not null,
  explanation text not null,
  policy_version integer not null check (policy_version > 0),
  retrieved_feedback jsonb not null default '[]',
  provenance jsonb not null,
  created_at timestamptz not null default now(),
  check (
    (stage = 1 and stage_one_analysis_id is null)
    or (stage = 2 and stage_one_analysis_id is not null)
  )
);

create table public.sanitized_feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  analysis_id uuid not null unique
    references public.comment_analyses(id) on delete cascade,
  neutral_text text,
  normalized_question text,
  no_signal boolean not null,
  created_at timestamptz not null default now(),
  check (
    no_signal = (neutral_text is null and normalized_question is null)
  )
);

create table public.creator_feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  raw_comment_id uuid not null
    references public.raw_comments(id) on delete cascade,
  analysis_id uuid not null
    references public.comment_analyses(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id),
  decision text not null
    check (decision in ('approved', 'rejected', 'corrected')),
  corrected_category public.comment_category,
  corrected_review_level public.review_level,
  corrected_recommended_action public.recommended_action,
  edited_sanitized_feedback text,
  use_for_personalization boolean not null default false,
  use_for_training boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.feedback_embeddings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  creator_feedback_id uuid not null unique
    references public.creator_feedback(id) on delete cascade,
  embedding vector(1536) not null,
  embedding_model text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.workspace_analysis_summaries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  analysis_job_id uuid not null unique
    references public.analysis_jobs(id) on delete cascade,
  source_analysis_count integer not null check (source_analysis_count >= 10),
  summary_text text not null,
  provider text not null,
  model_identifier text not null,
  provider_response_id text,
  prompt_version text not null,
  schema_version text not null,
  usage jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.evaluation_cases (
  id text primary key,
  locale text not null check (locale = 'ko-KR'),
  fixture jsonb not null,
  expected jsonb not null,
  reviewed_by text not null,
  reviewed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.moderation_action_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  raw_comment_id uuid not null
    references public.raw_comments(id) on delete restrict,
  requested_by uuid not null references auth.users(id),
  action public.moderation_action not null,
  idempotency_key text not null unique,
  state public.action_state not null,
  confirmed_at timestamptz,
  executed_at timestamptz,
  provider_result jsonb,
  error_code text,
  created_at timestamptz not null default now()
);

create table public.evidence_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  action_request_id uuid not null unique
    references public.moderation_action_requests(id) on delete restrict,
  raw_comment_id uuid not null
    references public.raw_comments(id) on delete restrict,
  source_snapshot jsonb not null,
  captured_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  target_type text not null,
  target_id text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.deletion_audit_logs (
  id uuid primary key default gen_random_uuid(),
  deleted_workspace_id uuid not null,
  actor_fingerprint text not null,
  event_type text not null check (event_type = 'workspace_data_deleted'),
  created_at timestamptz not null default now()
);

create index phrase_rules_workspace_enabled_idx
  on public.phrase_rules(workspace_id, enabled, kind);

create index rule_evaluations_workspace_comment_idx
  on public.rule_evaluations(workspace_id, raw_comment_id, created_at desc);

create index analysis_jobs_workspace_created_idx
  on public.analysis_jobs(workspace_id, created_at desc);

create index analysis_items_workspace_status_idx
  on public.analysis_job_items(workspace_id, status, created_at);

create index model_runs_workspace_comment_stage_idx
  on public.model_runs(workspace_id, raw_comment_id, stage, created_at desc);

create index comment_analyses_workspace_level_idx
  on public.comment_analyses(
    workspace_id,
    review_level,
    created_at desc
  );

create index creator_feedback_workspace_personalization_idx
  on public.creator_feedback(workspace_id, use_for_personalization, created_at desc);

create index moderation_requests_workspace_state_idx
  on public.moderation_action_requests(workspace_id, state, created_at desc);

create index audit_logs_workspace_created_idx
  on public.audit_logs(workspace_id, created_at desc);

create index feedback_embeddings_vector_idx
  on public.feedback_embeddings
  using hnsw (embedding vector_cosine_ops)
  where deleted_at is null;

create view public.current_comment_analyses
with (security_invoker = true)
as
select ranked.*
from (
  select
    ca.*,
    row_number() over (
      partition by ca.workspace_id, ca.raw_comment_id
      order by ca.created_at desc, ca.stage desc, ca.id desc
    ) as current_rank
  from public.comment_analyses ca
) ranked
where ranked.current_rank = 1;
