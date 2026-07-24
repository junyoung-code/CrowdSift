create or replace function public.get_retryable_dashboard_summary_jobs(
  target_max_jobs integer
)
returns table (
  analysis_job_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if target_max_jobs < 1 or target_max_jobs > 25 then
    raise exception 'invalid summary worker batch size' using errcode = '22023';
  end if;

  return query
  select aj.id
  from public.analysis_jobs aj
  left join public.workspace_analysis_summaries summary
    on summary.analysis_job_id = aj.id
  left join public.workspace_analysis_summary_jobs summary_job
    on summary_job.analysis_job_id = aj.id
  where summary.analysis_job_id is null
    and aj.status in ('succeeded', 'partially_succeeded', 'failed')
    and aj.completed_count >= 10
    and (
      summary_job.analysis_job_id is null
      or (
        summary_job.attempt_count < 3
        and (
          summary_job.state in ('pending', 'failed')
          or (
            summary_job.state = 'running'
            and summary_job.last_attempt_at < now() - interval '5 minutes'
          )
        )
      )
    )
  order by
    coalesce(summary_job.updated_at, aj.finished_at, aj.created_at),
    aj.id
  limit target_max_jobs;
end;
$$;

revoke all on function public.get_retryable_dashboard_summary_jobs(integer)
  from public;

grant execute on function public.get_retryable_dashboard_summary_jobs(integer)
  to service_role;
