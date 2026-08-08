create function public.list_unanalyzed_channel_sync_raw_comment_ids(
  target_workspace_id uuid,
  target_youtube_video_id text,
  target_configuration_key text
)
returns table(raw_comment_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select raw_source.id as raw_comment_id
  from public.raw_comments as raw_source
  join public.comment_import_jobs as first_import
    on first_import.id = raw_source.first_import_job_id
  where raw_source.workspace_id = target_workspace_id
    and raw_source.youtube_video_id = target_youtube_video_id
    and first_import.workspace_id = target_workspace_id
    and first_import.youtube_video_id = target_youtube_video_id
    and first_import.source_kind = 'owned_oauth'
    and first_import.trigger_kind = 'channel_sync'
    and first_import.channel_sync_run_id is not null
    and not exists (
      select 1
      from public.analysis_job_items as existing_item
      join public.analysis_jobs as existing_job
        on existing_job.id = existing_item.analysis_job_id
      where existing_item.workspace_id = target_workspace_id
        and existing_item.raw_comment_id = raw_source.id
        and existing_job.workspace_id = target_workspace_id
        and existing_job.configuration_key = target_configuration_key
    )
  order by raw_source.captured_at, raw_source.id;
$$;

create function public.finalize_channel_sync_video_import_job(
  target_import_job_id uuid,
  target_run_id uuid,
  target_claim_token uuid,
  target_observed_count integer,
  target_stored_count integer,
  target_updated_count integer,
  target_duplicate_count integer,
  target_failed_count integer,
  target_top_level_count integer,
  target_reply_count integer,
  target_error_code text,
  target_status public.job_status
)
returns public.comment_import_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  target_setting public.channel_comment_sync_settings;
  target_run public.channel_comment_sync_runs;
  target_import public.comment_import_jobs;
  target_setting_id uuid;
begin
  if target_observed_count < 0
    or target_stored_count < 0
    or target_updated_count < 0
    or target_duplicate_count < 0
    or target_failed_count < 0
    or target_top_level_count < 0
    or target_reply_count < 0
  then
    raise exception 'channel sync import counts cannot be negative'
      using errcode = '22023';
  end if;

  if target_observed_count <>
    target_stored_count
      + target_updated_count
      + target_duplicate_count
      + target_failed_count
    or target_observed_count <> target_top_level_count + target_reply_count
  then
    raise exception 'channel sync import counts do not reconcile'
      using errcode = '22023';
  end if;

  if target_status not in ('succeeded', 'partially_succeeded', 'failed') then
    raise exception 'channel sync import status must be terminal'
      using errcode = '22023';
  end if;

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
  into target_run
  from public.channel_comment_sync_runs as sync_run
  where sync_run.id = target_run_id
  for update;

  if target_run.id is null then
    raise exception 'channel sync run not found' using errcode = 'P0002';
  end if;

  if target_run.claim_token is distinct from target_claim_token then
    raise exception 'channel sync lease claim is stale' using errcode = '40001';
  end if;

  if target_run.status <> 'running' then
    raise exception 'channel sync run is not running' using errcode = '55000';
  end if;

  if target_setting.lease_until is null
    or target_setting.lease_until <= now()
  then
    raise exception 'channel sync lease claim is stale' using errcode = '40001';
  end if;

  select import_job.*
  into target_import
  from public.comment_import_jobs as import_job
  where import_job.id = target_import_job_id
  for update;

  if target_import.id is null then
    raise exception 'channel sync import job not found' using errcode = 'P0002';
  end if;

  if target_import.workspace_id is distinct from target_run.workspace_id
    or target_import.channel_sync_run_id is distinct from target_run.id
    or target_import.source_kind <> 'owned_oauth'
    or target_import.trigger_kind <> 'channel_sync'
  then
    raise exception 'channel sync import job does not belong to claim'
      using errcode = '22023';
  end if;

  if target_import.status in ('succeeded', 'partially_succeeded', 'failed') then
    return target_import;
  end if;

  if target_import.status <> 'running' then
    raise exception 'channel sync import job is not running'
      using errcode = '55000';
  end if;

  update public.comment_import_jobs
  set
    status = target_status,
    fetched_count = target_observed_count,
    stored_count = target_stored_count,
    updated_count = target_updated_count,
    duplicate_count = target_duplicate_count,
    failed_count = target_failed_count,
    top_level_count = target_top_level_count,
    reply_count = target_reply_count,
    last_error_code = target_error_code,
    next_page_token = null,
    finished_at = now()
  where id = target_import.id
  returning * into target_import;

  return target_import;
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
  retry_at timestamptz := now() + interval '5 minutes';
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

revoke all on function public.list_unanalyzed_channel_sync_raw_comment_ids(
  uuid,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.finalize_channel_sync_video_import_job(
  uuid,
  uuid,
  uuid,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  text,
  public.job_status
) from public, anon, authenticated;

grant execute on function public.list_unanalyzed_channel_sync_raw_comment_ids(
  uuid,
  text,
  text
) to service_role;
grant execute on function public.finalize_channel_sync_video_import_job(
  uuid,
  uuid,
  uuid,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  text,
  public.job_status
) to service_role;
