create or replace function public.claim_analysis_job_items(
  target_analysis_job_id uuid,
  target_max_items integer
)
returns table (
  item_id uuid,
  raw_comment_id uuid,
  workspace_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_max_items < 1 or target_max_items > 5 then
    raise exception 'analysis claim size must be between 1 and 5'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.analysis_jobs aj
    where aj.id = target_analysis_job_id
  ) then
    raise exception 'analysis job not found' using errcode = 'P0002';
  end if;

  update public.analysis_jobs
  set
    status = 'running',
    started_at = coalesce(started_at, now())
  where id = target_analysis_job_id
    and status in ('pending', 'running', 'partially_succeeded');

  return query
  with candidates as (
    select aji.id
    from public.analysis_job_items aji
    where aji.analysis_job_id = target_analysis_job_id
      and aji.status = 'pending'
    order by aji.created_at, aji.id
    for update skip locked
    limit target_max_items
  )
  update public.analysis_job_items aji
  set
    status = 'running',
    attempt_count = aji.attempt_count + 1,
    error_code = null,
    started_at = now(),
    finished_at = null
  from candidates
  where aji.id = candidates.id
  returning aji.id, aji.raw_comment_id, aji.workspace_id;
end;
$$;

revoke all on function public.claim_analysis_job_items(
  uuid,
  integer
) from public, anon, authenticated;

grant execute on function public.claim_analysis_job_items(
  uuid,
  integer
) to service_role;
