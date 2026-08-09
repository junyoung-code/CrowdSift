alter table public.comment_import_jobs
  add column analyzed_count integer not null default 0
    check (analyzed_count >= 0);

update public.comment_import_jobs as import_job
set analyzed_count = assignment_count.total_count
from (
  select
    assignment.assigned_import_job_id,
    count(*)::integer as total_count
  from public.channel_sync_analysis_assignments as assignment
  where assignment.analysis_job_id is not null
  group by assignment.assigned_import_job_id
) as assignment_count
where import_job.id = assignment_count.assigned_import_job_id;

create function public.update_channel_sync_import_analyzed_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.analysis_job_id is not null
    and (
      tg_op = 'INSERT'
      or old.analysis_job_id is distinct from new.analysis_job_id
    )
  then
    update public.comment_import_jobs as import_job
    set analyzed_count = (
      select count(*)::integer
      from public.channel_sync_analysis_assignments as assignment
      where assignment.assigned_import_job_id = new.assigned_import_job_id
        and assignment.analysis_job_id is not null
    )
    where import_job.id = new.assigned_import_job_id;
  end if;

  return new;
end;
$$;

create trigger channel_sync_assignment_updates_import_count
after insert or update of analysis_job_id
on public.channel_sync_analysis_assignments
for each row
execute function public.update_channel_sync_import_analyzed_count();

revoke all on function public.update_channel_sync_import_analyzed_count()
  from public, anon, authenticated, service_role;

drop function public.create_or_get_channel_sync_video_import_job(
  uuid,
  uuid,
  uuid,
  text,
  text
);

create function public.create_or_get_channel_sync_video_import_job(
  target_run_id uuid,
  target_claim_token uuid,
  target_workspace_id uuid,
  target_youtube_video_id text,
  target_provider_mode text
)
returns table(
  id uuid,
  status public.job_status,
  is_terminal boolean,
  stored_count integer,
  updated_count integer,
  duplicate_count integer,
  failed_count integer,
  analyzed_count integer,
  quota_units_used integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_run public.channel_comment_sync_runs;
  locked_import public.comment_import_jobs;
begin
  select claim.*
  into locked_run
  from public.lock_active_channel_sync_claim(
    target_run_id,
    target_claim_token,
    target_workspace_id
  ) as claim;

  if nullif(btrim(target_youtube_video_id), '') is null then
    raise exception 'youtube video id is required' using errcode = '22023';
  end if;

  if target_provider_mode not in ('live', 'fixture') then
    raise exception 'channel sync provider mode is invalid' using errcode = '22023';
  end if;

  select import_job.*
  into locked_import
  from public.comment_import_jobs as import_job
  where import_job.channel_sync_run_id = locked_run.id
    and import_job.youtube_video_id = target_youtube_video_id
    and import_job.trigger_kind = 'channel_sync'
  for update;

  if locked_import.id is null then
    insert into public.comment_import_jobs (
      workspace_id,
      youtube_video_id,
      requested_top_level_count,
      requested_total_count,
      source_kind,
      source_video_url,
      provider_mode,
      channel_sync_run_id,
      trigger_kind,
      status,
      started_at
    )
    values (
      target_workspace_id,
      target_youtube_video_id,
      null,
      null,
      'owned_oauth',
      null,
      target_provider_mode,
      locked_run.id,
      'channel_sync',
      'running',
      now()
    )
    returning * into locked_import;
  end if;

  if locked_import.workspace_id is distinct from target_workspace_id
    or locked_import.channel_sync_run_id is distinct from locked_run.id
    or locked_import.youtube_video_id is distinct from target_youtube_video_id
    or locked_import.source_kind <> 'owned_oauth'
    or locked_import.trigger_kind <> 'channel_sync'
  then
    raise exception 'channel sync import job does not belong to claim'
      using errcode = '22023';
  end if;

  if locked_import.provider_mode is distinct from target_provider_mode then
    raise exception 'provider_mode_mismatch' using errcode = '22023';
  end if;

  id := locked_import.id;
  status := locked_import.status;
  is_terminal := locked_import.status in (
    'succeeded',
    'partially_succeeded',
    'failed'
  );
  stored_count := locked_import.stored_count;
  updated_count := locked_import.updated_count;
  duplicate_count := locked_import.duplicate_count;
  failed_count := locked_import.failed_count;
  analyzed_count := locked_import.analyzed_count;
  quota_units_used := locked_import.youtube_quota_units_used;
  return next;
end;
$$;

create or replace function public.record_channel_sync_import_item_failure(
  target_import_job_id uuid,
  target_run_id uuid,
  target_claim_token uuid,
  target_workspace_id uuid,
  target_youtube_comment_id text,
  target_error_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_run public.channel_comment_sync_runs;
  locked_import public.comment_import_jobs;
begin
  select claim.*
  into locked_run
  from public.lock_active_channel_sync_claim(
    target_run_id,
    target_claim_token,
    target_workspace_id
  ) as claim;

  select import_job.*
  into locked_import
  from public.comment_import_jobs as import_job
  where import_job.id = target_import_job_id
  for update;

  if locked_import.id is null then
    raise exception 'channel sync import job not found' using errcode = 'P0002';
  end if;

  if locked_import.workspace_id is distinct from target_workspace_id
    or locked_import.channel_sync_run_id is distinct from locked_run.id
    or locked_import.source_kind <> 'owned_oauth'
    or locked_import.trigger_kind <> 'channel_sync'
  then
    raise exception 'channel sync import job does not belong to claim'
      using errcode = '22023';
  end if;

  if locked_import.status <> 'running' then
    raise exception 'channel sync import job is not running'
      using errcode = '55000';
  end if;

  insert into public.comment_import_items (
    import_job_id,
    workspace_id,
    youtube_comment_id,
    status,
    error_code
  )
  values (
    locked_import.id,
    target_workspace_id,
    target_youtube_comment_id,
    'failed',
    target_error_code
  )
  on conflict (import_job_id, youtube_comment_id) do update
  set
    status = 'failed',
    raw_comment_id = null,
    error_code = excluded.error_code
  where comment_import_items.raw_comment_id is null
    and comment_import_items.status <> 'succeeded';
end;
$$;

create function public.finalize_channel_sync_video_import_job_v2(
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
  target_quota_units_used integer,
  target_error_code text,
  target_status public.job_status
)
returns public.comment_import_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_run public.channel_comment_sync_runs;
  locked_import public.comment_import_jobs;
  finalized_import public.comment_import_jobs;
  was_terminal boolean;
begin
  if target_quota_units_used < 0 then
    raise exception 'channel sync quota count cannot be negative'
      using errcode = '22023';
  end if;

  select claim.*
  into locked_run
  from public.lock_active_channel_sync_claim(
    target_run_id,
    target_claim_token,
    (
      select import_job.workspace_id
      from public.comment_import_jobs as import_job
      where import_job.id = target_import_job_id
    )
  ) as claim;

  select import_job.*
  into locked_import
  from public.comment_import_jobs as import_job
  where import_job.id = target_import_job_id
  for update;

  if locked_import.id is null then
    raise exception 'channel sync import job not found' using errcode = 'P0002';
  end if;

  was_terminal := locked_import.status in (
    'succeeded',
    'partially_succeeded',
    'failed'
  );

  finalized_import := public.finalize_channel_sync_video_import_job(
    target_import_job_id,
    target_run_id,
    target_claim_token,
    target_observed_count,
    target_stored_count,
    target_updated_count,
    target_duplicate_count,
    target_failed_count,
    target_top_level_count,
    target_reply_count,
    target_error_code,
    target_status
  );

  if not was_terminal then
    update public.comment_import_jobs as import_job
    set youtube_quota_units_used = target_quota_units_used
    where import_job.id = target_import_job_id
    returning import_job.* into finalized_import;
  end if;

  return finalized_import;
end;
$$;

revoke all on function public.create_or_get_channel_sync_video_import_job(
  uuid,
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.finalize_channel_sync_video_import_job_v2(
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
  integer,
  text,
  public.job_status
) from public, anon, authenticated;

grant execute on function public.create_or_get_channel_sync_video_import_job(
  uuid,
  uuid,
  uuid,
  text,
  text
) to service_role;
grant execute on function public.finalize_channel_sync_video_import_job_v2(
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
  integer,
  text,
  public.job_status
) to service_role;
