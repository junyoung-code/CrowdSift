-- The product owner approved discarding legacy AI-derived data. Keep source
-- imports, raw comments, YouTube records, moderation actions, and audit logs.
delete from public.workspace_analysis_summary_jobs;
delete from public.workspace_analysis_summaries;
delete from public.analysis_job_costs;
delete from public.feedback_embeddings;
delete from public.creator_feedback;
delete from public.sanitized_feedback;
delete from public.comment_analyses;
delete from public.model_runs;
delete from public.rule_evaluations;
delete from public.analysis_job_items;
delete from public.analysis_jobs;

create table public.classification_stage_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  raw_comment_id uuid not null
    references public.raw_comments(id) on delete cascade,
  analysis_job_item_id uuid not null
    references public.analysis_job_items(id) on delete cascade,
  stage text not null check (stage in ('moderation', 'luna', 'terra')),
  provider text not null check (length(trim(provider)) > 0),
  model_identifier text not null check (length(trim(model_identifier)) > 0),
  provider_response_id text,
  idempotency_key text not null unique,
  prompt_version text,
  schema_version text not null check (length(trim(schema_version)) > 0),
  policy_version integer not null check (policy_version > 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  usage jsonb not null default '{}',
  status text not null check (status in ('succeeded', 'failed', 'refused')),
  output jsonb not null default '{}',
  error_code text,
  created_at timestamptz not null default now(),
  unique (analysis_job_item_id, stage)
);

create table public.classification_branches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  raw_comment_id uuid not null
    references public.raw_comments(id) on delete cascade,
  analysis_job_item_id uuid not null unique
    references public.analysis_job_items(id) on delete cascade,
  outcome text not null check (outcome in ('instant_safe', 'verify')),
  reasons jsonb not null default '[]',
  protection jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.classification_verdicts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  raw_comment_id uuid not null
    references public.raw_comments(id) on delete cascade,
  analysis_job_item_id uuid not null unique
    references public.analysis_job_items(id) on delete cascade,
  status text not null check (status in ('decided', 'review_queue')),
  level public.review_level,
  basis text not null check (length(trim(basis)) > 0),
  agreed_with_first_pass boolean,
  allow_rewrite boolean not null default false,
  hide_source boolean not null default true,
  recommended_actions jsonb not null default '[]',
  reason_codes jsonb not null default '[]',
  feedback_type text not null
    check (feedback_type in ('actionable', 'preference', 'question', 'none')),
  feedback_core text,
  safety_case boolean not null default false,
  raised_by_moderation boolean not null default false,
  created_at timestamptz not null default now(),
  check (
    (status = 'decided' and level is not null)
    or (status = 'review_queue' and level is null)
  )
);

create table public.classification_feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  raw_comment_id uuid not null
    references public.raw_comments(id) on delete cascade,
  classification_verdict_id uuid not null
    references public.classification_verdicts(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved', 'rejected', 'corrected')),
  corrected_level public.review_level,
  edited_feedback_core text,
  use_for_personalization boolean not null default false,
  use_for_training boolean not null default false,
  created_at timestamptz not null default now(),
  check (decision <> 'corrected' or corrected_level is not null)
);

create index classification_stage_runs_workspace_comment_idx
  on public.classification_stage_runs(workspace_id, raw_comment_id, created_at desc);

create index classification_stage_runs_workspace_item_idx
  on public.classification_stage_runs(workspace_id, analysis_job_item_id);

create index classification_branches_workspace_comment_idx
  on public.classification_branches(workspace_id, raw_comment_id, created_at desc);

create index classification_verdicts_workspace_level_idx
  on public.classification_verdicts(workspace_id, level, created_at desc);

create index classification_verdicts_workspace_comment_idx
  on public.classification_verdicts(workspace_id, raw_comment_id, created_at desc);

create index classification_feedback_workspace_comment_idx
  on public.classification_feedback(workspace_id, raw_comment_id, created_at desc);

alter table public.classification_stage_runs enable row level security;
alter table public.classification_branches enable row level security;
alter table public.classification_verdicts enable row level security;
alter table public.classification_feedback enable row level security;

create policy "members read classification stage runs"
  on public.classification_stage_runs for select
  using (public.is_workspace_member(workspace_id));

create policy "members read classification branches"
  on public.classification_branches for select
  using (public.is_workspace_member(workspace_id));

create policy "members read classification verdicts"
  on public.classification_verdicts for select
  using (public.is_workspace_member(workspace_id));

create policy "members read classification feedback"
  on public.classification_feedback for select
  using (public.is_workspace_member(workspace_id));

revoke all on table
  public.classification_stage_runs,
  public.classification_branches,
  public.classification_verdicts,
  public.classification_feedback
from public, anon, authenticated;

grant select on table
  public.classification_stage_runs,
  public.classification_branches,
  public.classification_verdicts,
  public.classification_feedback
to authenticated;

grant select, insert, update, delete on table
  public.classification_stage_runs,
  public.classification_branches,
  public.classification_verdicts,
  public.classification_feedback
to service_role;
