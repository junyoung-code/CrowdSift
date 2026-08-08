create function public.lock_active_channel_sync_claim(
  target_run_id uuid,
  target_claim_token uuid,
  target_workspace_id uuid
)
returns public.channel_comment_sync_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_setting public.channel_comment_sync_settings;
  locked_run public.channel_comment_sync_runs;
  target_setting_id uuid;
begin
  select sync_run.setting_id
  into target_setting_id
  from public.channel_comment_sync_runs as sync_run
  where sync_run.id = target_run_id;

  if target_setting_id is null then
    raise exception 'channel sync run not found' using errcode = 'P0002';
  end if;

  select sync_setting.*
  into locked_setting
  from public.channel_comment_sync_settings as sync_setting
  where sync_setting.id = target_setting_id
  for update;

  if locked_setting.id is null then
    raise exception 'channel sync setting not found' using errcode = 'P0002';
  end if;

  select sync_run.*
  into locked_run
  from public.channel_comment_sync_runs as sync_run
  where sync_run.id = target_run_id
  for update;

  if locked_run.id is null then
    raise exception 'channel sync run not found' using errcode = 'P0002';
  end if;

  if locked_run.claim_token is distinct from target_claim_token then
    raise exception 'channel sync lease claim is stale' using errcode = '40001';
  end if;

  if locked_run.status <> 'running' then
    raise exception 'channel sync run is not running' using errcode = '55000';
  end if;

  if locked_setting.lease_until is null
    or locked_setting.lease_until <= now()
  then
    raise exception 'channel sync lease claim is stale' using errcode = '40001';
  end if;

  if locked_run.workspace_id is distinct from target_workspace_id
    or locked_setting.workspace_id is distinct from target_workspace_id
    or locked_run.setting_id is distinct from locked_setting.id
  then
    raise exception 'channel sync claim workspace mismatch'
      using errcode = '42501';
  end if;

  return locked_run;
end;
$$;

create function public.create_or_get_channel_sync_video_import_job(
  target_run_id uuid,
  target_claim_token uuid,
  target_workspace_id uuid,
  target_youtube_video_id text,
  target_provider_mode text
)
returns table(id uuid, status public.job_status)
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

  id := locked_import.id;
  status := locked_import.status;
  return next;
end;
$$;

alter function public.store_import_comment_item(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  timestamptz,
  timestamptz,
  jsonb
) rename to store_import_comment_item_internal;

revoke all on function public.store_import_comment_item_internal(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  timestamptz,
  timestamptz,
  jsonb
) from public, anon, authenticated, service_role;

create function public.store_import_comment_item(
  target_import_job_id uuid,
  target_workspace_id uuid,
  target_youtube_video_id text,
  target_youtube_comment_id text,
  target_parent_youtube_comment_id text,
  target_author_channel_id text,
  target_author_display_name text,
  target_author_avatar_url text,
  target_text_display text,
  target_text_original text,
  target_like_count integer,
  target_source_moderation_status text,
  target_published_at timestamptz,
  target_updated_at timestamptz,
  target_payload jsonb
)
returns table(disposition text, raw_comment_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_trigger_kind text;
begin
  select import_job.trigger_kind
  into target_trigger_kind
  from public.comment_import_jobs as import_job
  where import_job.id = target_import_job_id
  for update;

  if target_trigger_kind = 'channel_sync' then
    raise exception 'channel sync source storage requires a fenced claim'
      using errcode = '55000';
  end if;

  return query
  select stored.disposition, stored.raw_comment_id
  from public.store_import_comment_item_internal(
    target_import_job_id,
    target_workspace_id,
    target_youtube_video_id,
    target_youtube_comment_id,
    target_parent_youtube_comment_id,
    target_author_channel_id,
    target_author_display_name,
    target_author_avatar_url,
    target_text_display,
    target_text_original,
    target_like_count,
    target_source_moderation_status,
    target_published_at,
    target_updated_at,
    target_payload
  ) as stored;
end;
$$;

create function public.store_channel_sync_comment_item(
  target_import_job_id uuid,
  target_run_id uuid,
  target_claim_token uuid,
  target_workspace_id uuid,
  target_youtube_video_id text,
  target_youtube_comment_id text,
  target_parent_youtube_comment_id text,
  target_author_channel_id text,
  target_author_display_name text,
  target_author_avatar_url text,
  target_text_display text,
  target_text_original text,
  target_like_count integer,
  target_source_moderation_status text,
  target_published_at timestamptz,
  target_updated_at timestamptz,
  target_payload jsonb
)
returns table(disposition text, raw_comment_id uuid)
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
    or locked_import.youtube_video_id is distinct from target_youtube_video_id
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

  return query
  select stored.disposition, stored.raw_comment_id
  from public.store_import_comment_item_internal(
    target_import_job_id,
    target_workspace_id,
    target_youtube_video_id,
    target_youtube_comment_id,
    target_parent_youtube_comment_id,
    target_author_channel_id,
    target_author_display_name,
    target_author_avatar_url,
    target_text_display,
    target_text_original,
    target_like_count,
    target_source_moderation_status,
    target_published_at,
    target_updated_at,
    target_payload
  ) as stored;
end;
$$;

create function public.record_channel_sync_import_item_failure(
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
    error_code = excluded.error_code;
end;
$$;

create table public.channel_sync_analysis_assignments (
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,
  raw_comment_id uuid not null
    references public.raw_comments(id) on delete restrict,
  configuration_key text not null,
  assigned_import_job_id uuid not null
    references public.comment_import_jobs(id) on delete restrict,
  analysis_job_id uuid
    references public.analysis_jobs(id) on delete restrict,
  created_at timestamptz not null default now(),
  attached_at timestamptz,
  primary key (workspace_id, raw_comment_id, configuration_key)
);

create index channel_sync_analysis_assignments_job_idx
  on public.channel_sync_analysis_assignments(analysis_job_id)
  where analysis_job_id is not null;

alter table public.channel_sync_analysis_assignments enable row level security;

revoke all on table public.channel_sync_analysis_assignments
  from public, anon, authenticated;
grant all on table public.channel_sync_analysis_assignments to service_role;

insert into public.channel_sync_analysis_assignments (
  workspace_id,
  raw_comment_id,
  configuration_key,
  assigned_import_job_id,
  analysis_job_id,
  attached_at
)
select distinct on (
  analysis_item.workspace_id,
  analysis_item.raw_comment_id,
  analysis_job.configuration_key
)
  analysis_item.workspace_id,
  analysis_item.raw_comment_id,
  analysis_job.configuration_key,
  analysis_job.import_job_id,
  analysis_job.id,
  analysis_item.created_at
from public.analysis_job_items as analysis_item
join public.analysis_jobs as analysis_job
  on analysis_job.id = analysis_item.analysis_job_id
join public.comment_import_jobs as assigned_import
  on assigned_import.id = analysis_job.import_job_id
join public.raw_comments as raw_source
  on raw_source.id = analysis_item.raw_comment_id
join public.comment_import_jobs as first_import
  on first_import.id = raw_source.first_import_job_id
where assigned_import.trigger_kind = 'channel_sync'
  and assigned_import.source_kind = 'owned_oauth'
  and assigned_import.channel_sync_run_id is not null
  and first_import.trigger_kind = 'channel_sync'
  and first_import.source_kind = 'owned_oauth'
  and first_import.channel_sync_run_id is not null
order by
  analysis_item.workspace_id,
  analysis_item.raw_comment_id,
  analysis_job.configuration_key,
  analysis_item.created_at,
  analysis_job.id
on conflict (workspace_id, raw_comment_id, configuration_key) do nothing;

create or replace function public.list_unanalyzed_channel_sync_raw_comment_ids(
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
    and not exists (
      select 1
      from public.channel_sync_analysis_assignments as assignment
      where assignment.workspace_id = target_workspace_id
        and assignment.raw_comment_id = raw_source.id
        and assignment.configuration_key = target_configuration_key
    )
  order by raw_source.captured_at, raw_source.id;
$$;

create function public.attach_channel_sync_analysis_items(
  target_import_job_id uuid,
  target_run_id uuid,
  target_claim_token uuid,
  target_workspace_id uuid,
  target_youtube_video_id text,
  target_configuration_key text
)
returns table(analysis_job_id uuid, raw_comment_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_run public.channel_comment_sync_runs;
  locked_import public.comment_import_jobs;
  target_analysis_job public.analysis_jobs;
  reserved_raw_comment_ids uuid[];
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
    or locked_import.youtube_video_id is distinct from target_youtube_video_id
    or locked_import.source_kind <> 'owned_oauth'
    or locked_import.trigger_kind <> 'channel_sync'
  then
    raise exception 'channel sync import job does not belong to claim'
      using errcode = '22023';
  end if;

  if locked_import.status not in ('succeeded', 'partially_succeeded', 'failed') then
    raise exception 'channel sync import job is not finalized'
      using errcode = '55000';
  end if;

  if nullif(btrim(target_configuration_key), '') is null then
    raise exception 'analysis configuration key is required'
      using errcode = '22023';
  end if;

  with eligible_source as (
    select raw_source.id
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
  ), reserved as (
    insert into public.channel_sync_analysis_assignments (
      workspace_id,
      raw_comment_id,
      configuration_key,
      assigned_import_job_id
    )
    select
      target_workspace_id,
      eligible_source.id,
      target_configuration_key,
      locked_import.id
    from eligible_source
    order by eligible_source.id
    on conflict on constraint channel_sync_analysis_assignments_pkey do nothing
    returning channel_sync_analysis_assignments.raw_comment_id
  )
  select coalesce(array_agg(reserved.raw_comment_id order by reserved.raw_comment_id), '{}')
  into reserved_raw_comment_ids
  from reserved;

  if cardinality(reserved_raw_comment_ids) = 0 then
    return;
  end if;

  select analysis_job.*
  into target_analysis_job
  from public.analysis_jobs as analysis_job
  where analysis_job.import_job_id = locked_import.id
    and analysis_job.configuration_key = target_configuration_key
  for update;

  if target_analysis_job.id is null then
    insert into public.analysis_jobs (
      workspace_id,
      import_job_id,
      configuration_key,
      status,
      total_count
    )
    values (
      target_workspace_id,
      locked_import.id,
      target_configuration_key,
      'pending',
      0
    )
    returning * into target_analysis_job;
  end if;

  insert into public.analysis_job_items (
    analysis_job_id,
    workspace_id,
    raw_comment_id,
    status
  )
  select
    target_analysis_job.id,
    target_workspace_id,
    reserved_raw_comment_id,
    'pending'
  from unnest(reserved_raw_comment_ids) as reserved_raw_comment_id
  on conflict on constraint
    analysis_job_items_analysis_job_id_raw_comment_id_key
  do nothing;

  update public.channel_sync_analysis_assignments as assignment
  set
    analysis_job_id = target_analysis_job.id,
    attached_at = now()
  where assignment.workspace_id = target_workspace_id
    and assignment.configuration_key = target_configuration_key
    and assignment.assigned_import_job_id = locked_import.id
    and assignment.raw_comment_id = any(reserved_raw_comment_ids);

  update public.analysis_jobs as analysis_job
  set
    status = case
      when analysis_job.status in ('succeeded', 'partially_succeeded', 'failed')
        then 'pending'
      else analysis_job.status
    end,
    total_count = (
      select count(*)::integer
      from public.analysis_job_items as analysis_item
      where analysis_item.analysis_job_id = target_analysis_job.id
    ),
    finished_at = case
      when analysis_job.status in ('succeeded', 'partially_succeeded', 'failed')
        then null
      else analysis_job.finished_at
    end
  where analysis_job.id = target_analysis_job.id;

  return query
  select target_analysis_job.id, attached.raw_comment_id
  from unnest(reserved_raw_comment_ids) as attached(raw_comment_id)
  order by attached.raw_comment_id;
end;
$$;

revoke all on function public.lock_active_channel_sync_claim(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.create_or_get_channel_sync_video_import_job(
  uuid,
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.store_import_comment_item(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  timestamptz,
  timestamptz,
  jsonb
) from public, anon, authenticated;
revoke all on function public.store_channel_sync_comment_item(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  timestamptz,
  timestamptz,
  jsonb
) from public, anon, authenticated;
revoke all on function public.record_channel_sync_import_item_failure(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.attach_channel_sync_analysis_items(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.create_or_get_channel_sync_video_import_job(
  uuid,
  uuid,
  uuid,
  text,
  text
) to service_role;
grant execute on function public.store_import_comment_item(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  timestamptz,
  timestamptz,
  jsonb
) to service_role;
grant execute on function public.store_channel_sync_comment_item(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  timestamptz,
  timestamptz,
  jsonb
) to service_role;
grant execute on function public.record_channel_sync_import_item_failure(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text
) to service_role;
grant execute on function public.attach_channel_sync_analysis_items(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text
) to service_role;
