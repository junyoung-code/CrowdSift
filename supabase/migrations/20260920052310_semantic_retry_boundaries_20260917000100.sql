create or replace function public.retry_semantic_rewrite(target_verdict_id uuid, target_workspace_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare item_id uuid; job_id uuid;
begin
  select analysis_job_item_id into item_id from public.classification_verdicts
  where id=target_verdict_id and workspace_id=target_workspace_id and pipeline_version='semantic-v1' and rewrite_status='failed' for update;
  if item_id is null then raise exception 'rewrite_not_retryable'; end if;
  -- Stage counters are stable even when attempts share the same transaction timestamp.
  update public.classification_verdicts set rewrite_status='pending', semantic_trace=jsonb_set(semantic_trace,'{rewriteStatus}','"pending"') where id=target_verdict_id;
  update public.analysis_job_items set status='pending',attempt_count=0,error_code=null,finished_at=null where id=item_id returning analysis_job_id into job_id;
  update public.analysis_jobs set status='pending',finished_at=null where id=job_id;
  insert into public.audit_logs(workspace_id,event_type,target_type,target_id,metadata)
  values(target_workspace_id,'classification.rewrite_retry','analysis_job_item',item_id,jsonb_build_object('afterAttempts',coalesce((select jsonb_object_agg(stage,last_attempt) from (select stage,max(attempt) last_attempt from public.semantic_attempts where analysis_job_item_id=item_id group by stage) boundary),'{}'::jsonb)));
end $$;
revoke all on function public.retry_semantic_rewrite(uuid,uuid) from public,anon,authenticated;
grant execute on function public.retry_semantic_rewrite(uuid,uuid) to service_role;


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

  if exists (select 1 from public.analysis_jobs where id=target_analysis_job_id and replacement_job_id is not null) then return; end if;

  -- 세 번째 시도 중 worker가 사라진 항목은 더 이상 running으로 남겨 두지 않는다.
  update public.analysis_job_items
  set
    status = 'failed',
    error_code = 'classification_worker_timeout',
    finished_at = now()
  where analysis_job_id = target_analysis_job_id
    and status = 'running'
    and attempt_count >= 3
    and started_at < now() - interval '15 minutes';

  update public.analysis_jobs
  set
    status = 'running',
    started_at = coalesce(started_at, now()),
    finished_at = null
  where id = target_analysis_job_id
    and status in ('pending', 'running', 'partially_succeeded', 'failed');

  return query
  with candidates as (
    select aji.id
    from public.analysis_job_items aji
    where aji.analysis_job_id = target_analysis_job_id
      and aji.attempt_count < 3
      and (
        aji.status = 'pending'
        or (
          aji.status = 'failed'
          and aji.error_code in (
            'openai_rate_limited',
            'openai_unavailable',
            'semantic_output_invalid',
            'classification_worker_timeout'
          )
        )
        or (
          aji.status = 'running'
          and aji.started_at < now() - interval '15 minutes'
        )
      )
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
