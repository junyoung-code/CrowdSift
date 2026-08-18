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

create or replace function public.fail_channel_comment_sync_run(
  target_run_id uuid,
  target_claim_token uuid,
  target_error_code text
)
returns public.channel_comment_sync_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  failed_run public.channel_comment_sync_runs;
  target_setting public.channel_comment_sync_settings;
  target_setting_id uuid;
  retry_at timestamptz := case
    when target_error_code = 'quota_exceeded' then
      (
        date_trunc('day', now() at time zone 'America/Los_Angeles')
        + interval '1 day'
      ) at time zone 'America/Los_Angeles'
    when target_error_code in ('youtube_rate_limited', 'provider_error') then
      now() + interval '15 minutes'
    when target_error_code = 'permission_revoked' then
      now() + interval '24 hours'
    else now() + interval '5 minutes'
  end;
begin
  select sync_run.setting_id
  into target_setting_id
  from public.channel_comment_sync_runs as sync_run
  where sync_run.id = target_run_id;

  if target_setting_id is null then
    raise exception 'channel sync run not found' using errcode = 'P0002';
  end if;

  select sync_setting.*
  into target_setting
  from public.channel_comment_sync_settings as sync_setting
  where sync_setting.id = target_setting_id
  for update;

  if target_setting.id is null then
    raise exception 'channel sync setting not found' using errcode = 'P0002';
  end if;

  select sync_run.*
  into failed_run
  from public.channel_comment_sync_runs as sync_run
  where sync_run.id = target_run_id
  for update;

  if failed_run.id is null then
    raise exception 'channel sync run not found' using errcode = 'P0002';
  end if;

  if failed_run.claim_token is distinct from target_claim_token then
    raise exception 'channel sync lease claim is stale' using errcode = '40001';
  end if;

  if failed_run.status = 'failed' then
    update public.comment_import_jobs
    set
      status = 'failed',
      last_error_code = coalesce(failed_run.error_code, target_error_code),
      finished_at = coalesce(finished_at, now())
    where channel_sync_run_id = failed_run.id
      and trigger_kind = 'channel_sync'
      and status = 'running';
    return failed_run;
  end if;

  if failed_run.status <> 'running' then
    raise exception 'channel sync run is not running' using errcode = '55000';
  end if;

  if target_setting.lease_until is null
    or target_setting.lease_until <= now()
  then
    raise exception 'channel sync lease claim is stale' using errcode = '40001';
  end if;

  update public.channel_comment_sync_runs
  set
    status = 'failed',
    error_code = target_error_code,
    finished_at = now()
  where id = failed_run.id
  returning * into failed_run;

  update public.comment_import_jobs
  set
    status = 'failed',
    last_error_code = target_error_code,
    finished_at = coalesce(finished_at, now())
  where channel_sync_run_id = failed_run.id
    and trigger_kind = 'channel_sync'
    and status = 'running';

  update public.channel_comment_sync_settings
  set
    backfill_status = case
      when failed_run.kind = 'backfill_recent' then 'failed'
      else backfill_status
    end,
    reply_reconciliation_status = case
      when failed_run.kind = 'reply_reconciliation' then 'failed'
      else reply_reconciliation_status
    end,
    next_sync_at = case
      when failed_run.kind in ('backfill_recent', 'incremental')
        then retry_at
      else next_sync_at
    end,
    next_reply_reconciliation_at = case
      when failed_run.kind = 'reply_reconciliation' then retry_at
      else next_reply_reconciliation_at
    end,
    lease_until = null,
    last_error_code = target_error_code,
    updated_at = now()
  where id = failed_run.setting_id;

  return failed_run;
end;
$$;
