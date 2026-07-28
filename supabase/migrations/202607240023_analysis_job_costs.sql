create table public.analysis_job_costs (
  id uuid primary key default gen_random_uuid(),
  analysis_job_id uuid not null
    references public.analysis_jobs(id) on delete cascade,
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,
  pricing_version text not null check (length(trim(pricing_version)) > 0),
  pricing_effective_at timestamptz not null,
  currency text not null check (currency = 'USD'),
  stage_one_model text not null check (length(trim(stage_one_model)) > 0),
  stage_two_model text not null check (length(trim(stage_two_model)) > 0),
  embedding_model text not null check (length(trim(embedding_model)) > 0),
  stage_one_input_per_million numeric(18, 8) not null
    check (stage_one_input_per_million >= 0),
  stage_one_output_per_million numeric(18, 8) not null
    check (stage_one_output_per_million >= 0),
  stage_two_input_per_million numeric(18, 8) not null
    check (stage_two_input_per_million >= 0),
  stage_two_output_per_million numeric(18, 8) not null
    check (stage_two_output_per_million >= 0),
  embedding_input_per_million numeric(18, 8) not null
    check (embedding_input_per_million >= 0),
  estimated_input_tokens_low bigint not null default 0
    check (estimated_input_tokens_low >= 0),
  estimated_input_tokens_high bigint not null default 0
    check (estimated_input_tokens_high >= estimated_input_tokens_low),
  estimated_output_tokens_low bigint not null default 0
    check (estimated_output_tokens_low >= 0),
  estimated_output_tokens_high bigint not null default 0
    check (estimated_output_tokens_high >= estimated_output_tokens_low),
  estimated_cost_low numeric(18, 8) not null
    check (estimated_cost_low >= 0),
  estimated_cost_high numeric(18, 8) not null
    check (estimated_cost_high >= estimated_cost_low),
  actual_stage_one_input_tokens bigint not null default 0
    check (actual_stage_one_input_tokens >= 0),
  actual_stage_one_output_tokens bigint not null default 0
    check (actual_stage_one_output_tokens >= 0),
  actual_stage_two_input_tokens bigint not null default 0
    check (actual_stage_two_input_tokens >= 0),
  actual_stage_two_output_tokens bigint not null default 0
    check (actual_stage_two_output_tokens >= 0),
  actual_embedding_input_tokens bigint not null default 0
    check (actual_embedding_input_tokens >= 0),
  actual_calculated_cost numeric(18, 8)
    check (actual_calculated_cost is null or actual_calculated_cost >= 0),
  estimated_at timestamptz not null default now(),
  calculated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_job_id, pricing_version)
);

create index analysis_job_costs_workspace_created_idx
  on public.analysis_job_costs(workspace_id, created_at desc);

create or replace function public.enforce_analysis_job_cost_workspace()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.analysis_jobs aj
    where aj.id = new.analysis_job_id
      and aj.workspace_id = new.workspace_id
  ) then
    raise exception 'analysis cost workspace mismatch'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger analysis_job_cost_workspace_matches
before insert or update on public.analysis_job_costs
for each row execute function public.enforce_analysis_job_cost_workspace();

alter table public.analysis_job_costs enable row level security;

create policy "members read analysis job costs"
  on public.analysis_job_costs for select
  using (public.is_workspace_member(workspace_id));

revoke all on public.analysis_job_costs from public, anon, authenticated;

grant select on public.analysis_job_costs to authenticated;

grant select, insert, update, delete
  on public.analysis_job_costs
  to service_role;
