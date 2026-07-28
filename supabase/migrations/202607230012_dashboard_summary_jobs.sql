create table public.workspace_analysis_summary_jobs (
  analysis_job_id uuid primary key
    references public.analysis_jobs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  state text not null default 'pending'
    check (state in ('pending', 'running', 'succeeded', 'failed')),
  attempt_count integer not null default 0
    check (attempt_count >= 0 and attempt_count <= 10),
  last_error_code text,
  last_attempt_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, analysis_job_id)
);

create index workspace_analysis_summary_jobs_retry_idx
  on public.workspace_analysis_summary_jobs(state, last_attempt_at)
  where state in ('pending', 'running', 'failed');

alter table public.workspace_analysis_summary_jobs enable row level security;

create policy "members read dashboard summary jobs"
  on public.workspace_analysis_summary_jobs for select
  using (public.is_workspace_member(workspace_id));

revoke all on table public.workspace_analysis_summary_jobs
  from anon, authenticated;

grant select on table public.workspace_analysis_summary_jobs
  to authenticated;

grant select, insert, update, delete
  on table public.workspace_analysis_summary_jobs
  to service_role;

create or replace function public.claim_dashboard_summary_job(
  target_workspace_id uuid,
  target_analysis_job_id uuid,
  target_max_attempts integer
)
returns table (
  attempt_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_max_attempts < 1 or target_max_attempts > 10 then
    raise exception 'invalid summary attempt limit' using errcode = '22023';
  end if;

  insert into public.workspace_analysis_summary_jobs (
    workspace_id,
    analysis_job_id,
    state
  )
  select
    aj.workspace_id,
    aj.id,
    'pending'
  from public.analysis_jobs aj
  where aj.id = target_analysis_job_id
    and aj.workspace_id = target_workspace_id
    and aj.status in ('succeeded', 'partially_succeeded', 'failed')
  on conflict (analysis_job_id) do nothing;

  return query
  update public.workspace_analysis_summary_jobs summary_job
  set
    state = 'running',
    attempt_count = summary_job.attempt_count + 1,
    last_error_code = null,
    last_attempt_at = now(),
    started_at = coalesce(summary_job.started_at, now()),
    finished_at = null,
    updated_at = now()
  where summary_job.analysis_job_id = target_analysis_job_id
    and summary_job.workspace_id = target_workspace_id
    and summary_job.attempt_count < target_max_attempts
    and (
      summary_job.state in ('pending', 'failed')
      or (
        summary_job.state = 'running'
        and summary_job.last_attempt_at < now() - interval '5 minutes'
      )
    )
  returning summary_job.attempt_count;
end;
$$;

revoke all on function public.claim_dashboard_summary_job(
  uuid,
  uuid,
  integer
) from public;

grant execute on function public.claim_dashboard_summary_job(
  uuid,
  uuid,
  integer
) to service_role;
