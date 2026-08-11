alter table public.channel_comment_sync_settings
  add column incremental_scan_started_at timestamptz;

alter table public.channel_comment_sync_runs
  add column claim_token uuid;

revoke select on public.channel_comment_sync_runs from authenticated;

grant select (
  id,
  setting_id,
  workspace_id,
  kind,
  status,
  input_page_token,
  output_page_token,
  observed_count,
  stored_count,
  updated_count,
  duplicate_count,
  failed_count,
  analyzed_count,
  quota_units_used,
  error_code,
  started_at,
  finished_at,
  created_at
) on public.channel_comment_sync_runs to authenticated;

create unique index comment_import_jobs_channel_run_video_unique
  on public.comment_import_jobs(channel_sync_run_id, youtube_video_id)
  where trigger_kind = 'channel_sync';

create or replace function public.configure_channel_comment_sync(
  target_workspace_id uuid,
  target_start_date date
)
returns public.channel_comment_sync_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  target_connection_id uuid;
  target_channel_id text;
  target_start_at timestamptz;
  configured_setting public.channel_comment_sync_settings;
begin
  if not public.is_workspace_member(target_workspace_id) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;

  target_start_at :=
    target_start_date::timestamp at time zone 'Asia/Seoul';

  if target_start_at > now() then
    raise exception 'start date cannot be in the future' using errcode = '22023';
  end if;

  select yc.id, ycc.youtube_channel_id
  into target_connection_id, target_channel_id
  from public.youtube_connections yc
  join public.youtube_channel_candidates ycc
    on ycc.connection_id = yc.id
    and ycc.workspace_id = yc.workspace_id
    and ycc.selected
  where yc.workspace_id = target_workspace_id
    and yc.status = 'connected'
  limit 1;

  if target_connection_id is null then
    raise exception 'connected selected channel required'
      using errcode = 'P0002';
  end if;

  insert into public.channel_comment_sync_settings (
    workspace_id,
    connection_id,
    youtube_channel_id,
    enabled,
    backfill_start_at,
    sync_interval_minutes,
    backfill_status,
    backfill_page_token,
    incremental_page_token,
    incremental_scan_started_at,
    reply_reconciliation_status,
    reply_reconciliation_page_token,
    next_reply_reconciliation_at,
    next_sync_at,
    lease_until,
    last_error_code,
    updated_at
  )
  values (
    target_workspace_id,
    target_connection_id,
    target_channel_id,
    true,
    target_start_at,
    60,
    'pending',
    null,
    null,
    null,
    'pending',
    null,
    now(),
    now(),
    null,
    null,
    now()
  )
  on conflict (workspace_id) do update
  set
    connection_id = excluded.connection_id,
    youtube_channel_id = excluded.youtube_channel_id,
    enabled = true,
    backfill_start_at = excluded.backfill_start_at,
    sync_interval_minutes = 60,
    backfill_status = 'pending',
    backfill_page_token = null,
    incremental_page_token = null,
    incremental_scan_started_at = null,
    reply_reconciliation_status = 'pending',
    reply_reconciliation_page_token = null,
    next_reply_reconciliation_at = now(),
    next_sync_at = now(),
    lease_until = null,
    last_error_code = null,
    updated_at = now()
  returning * into configured_setting;

  update public.channel_comment_sync_runs
  set
    status = 'failed',
    claim_token = gen_random_uuid(),
    error_code = 'reconfigured',
    finished_at = now()
  where setting_id = configured_setting.id
    and status in ('pending', 'running');

  return configured_setting;
end;
$$;

create or replace function public.request_channel_comment_sync_now(
  target_workspace_id uuid
)
returns public.channel_comment_sync_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_setting public.channel_comment_sync_settings;
begin
  if not public.is_workspace_member(target_workspace_id) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;

  update public.channel_comment_sync_settings
  set
    enabled = true,
    next_sync_at = now(),
    updated_at = now()
  where workspace_id = target_workspace_id
  returning * into changed_setting;

  if changed_setting.id is null then
    raise exception 'channel sync is not configured' using errcode = 'P0002';
  end if;

  return changed_setting;
end;
$$;

create function public.claim_channel_comment_sync_work_internal(
  target_workspace_id uuid,
  target_limit integer,
  target_lease_seconds integer
)
returns table (
  setting_id uuid,
  run_id uuid,
  claim_token uuid,
  workspace_id uuid,
  connection_id uuid,
  youtube_channel_id text,
  run_kind text,
  backfill_start_at timestamptz,
  page_token text,
  last_successful_sync_at timestamptz,
  incremental_scan_started_at timestamptz
)
language plpgsql
set search_path = public
as $$
declare
  claimed_setting public.channel_comment_sync_settings;
  claimed_run public.channel_comment_sync_runs;
  next_kind text;
  next_token text;
begin
  for claimed_setting in
    select s.*
    from public.channel_comment_sync_settings s
    join public.youtube_connections yc
      on yc.id = s.connection_id
      and yc.workspace_id = s.workspace_id
      and yc.status = 'connected'
    where (target_workspace_id is null or s.workspace_id = target_workspace_id)
      and s.enabled
      and (s.lease_until is null or s.lease_until <= now())
      and (
        s.backfill_status in ('pending', 'running')
        or (
          s.backfill_status = 'failed'
          and s.next_sync_at <= now()
        )
        or (
          s.backfill_status = 'completed'
          and (
            s.next_sync_at <= now()
            or s.reply_reconciliation_status in ('pending', 'running')
            or (
              s.next_reply_reconciliation_at is not null
              and s.next_reply_reconciliation_at <= now()
            )
          )
        )
      )
    order by
      case
        when s.backfill_status = 'completed' and s.next_sync_at <= now() then 0
        when s.backfill_status <> 'completed' then 1
        else 2
      end,
      s.next_sync_at,
      s.created_at
    for update of s skip locked
    limit least(greatest(target_limit, 1), 10)
  loop
    claimed_run := null;

    select r.*
    into claimed_run
    from public.channel_comment_sync_runs r
    where r.setting_id = claimed_setting.id
      and r.status in ('pending', 'running')
    order by r.created_at
    limit 1
    for update;

    if claimed_run.id is null then
      next_kind := case
        when claimed_setting.backfill_status <> 'completed'
          then 'backfill_recent'
        when claimed_setting.next_sync_at <= now()
          then 'incremental'
        else 'reply_reconciliation'
      end;

      next_token := case next_kind
        when 'backfill_recent' then claimed_setting.backfill_page_token
        when 'incremental' then claimed_setting.incremental_page_token
        when 'reply_reconciliation'
          then claimed_setting.reply_reconciliation_page_token
        else null
      end;

      insert into public.channel_comment_sync_runs (
        setting_id,
        workspace_id,
        kind,
        status,
        claim_token,
        input_page_token,
        started_at
      )
      values (
        claimed_setting.id,
        claimed_setting.workspace_id,
        next_kind,
        'running',
        gen_random_uuid(),
        next_token,
        now()
      )
      returning * into claimed_run;
    else
      update public.channel_comment_sync_runs
      set
        status = 'running',
        claim_token = gen_random_uuid(),
        started_at = coalesce(started_at, now())
      where id = claimed_run.id
      returning * into claimed_run;
    end if;

    update public.channel_comment_sync_settings as sync_setting
    set
      lease_until =
        now() + make_interval(secs => greatest(target_lease_seconds, 30)),
      backfill_status = case
        when claimed_run.kind = 'backfill_recent' then 'running'
        else sync_setting.backfill_status
      end,
      incremental_scan_started_at = case
        when claimed_run.kind = 'incremental'
          then coalesce(sync_setting.incremental_scan_started_at, now())
        else sync_setting.incremental_scan_started_at
      end,
      reply_reconciliation_status = case
        when claimed_run.kind = 'reply_reconciliation' then 'running'
        else sync_setting.reply_reconciliation_status
      end,
      updated_at = now()
    where sync_setting.id = claimed_setting.id
    returning * into claimed_setting;

    setting_id := claimed_setting.id;
    run_id := claimed_run.id;
    claim_token := claimed_run.claim_token;
    workspace_id := claimed_setting.workspace_id;
    connection_id := claimed_setting.connection_id;
    youtube_channel_id := claimed_setting.youtube_channel_id;
    run_kind := claimed_run.kind;
    backfill_start_at := claimed_setting.backfill_start_at;
    page_token := claimed_run.input_page_token;
    last_successful_sync_at := claimed_setting.last_successful_sync_at;
    incremental_scan_started_at := claimed_setting.incremental_scan_started_at;
    return next;
  end loop;
end;
$$;

drop function public.claim_channel_comment_sync_work(integer, integer);

create function public.claim_channel_comment_sync_work(
  target_limit integer default 1,
  target_lease_seconds integer default 240
)
returns table (
  setting_id uuid,
  run_id uuid,
  claim_token uuid,
  workspace_id uuid,
  connection_id uuid,
  youtube_channel_id text,
  run_kind text,
  backfill_start_at timestamptz,
  page_token text,
  last_successful_sync_at timestamptz,
  incremental_scan_started_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.claim_channel_comment_sync_work_internal(
    null,
    target_limit,
    target_lease_seconds
  );
$$;

create function public.claim_channel_comment_sync_work_for_workspace(
  target_workspace_id uuid,
  target_requesting_user_id uuid,
  target_lease_seconds integer default 240
)
returns table (
  setting_id uuid,
  run_id uuid,
  claim_token uuid,
  workspace_id uuid,
  connection_id uuid,
  youtube_channel_id text,
  run_kind text,
  backfill_start_at timestamptz,
  page_token text,
  last_successful_sync_at timestamptz,
  incremental_scan_started_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_requesting_user_id is null or not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = target_requesting_user_id
  ) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;

  return query
  select *
  from public.claim_channel_comment_sync_work_internal(
    target_workspace_id,
    1,
    target_lease_seconds
  );
end;
$$;

create function public.complete_channel_comment_sync_run(
  target_run_id uuid,
  target_claim_token uuid,
  target_next_page_token text,
  target_reached_boundary boolean,
  target_observed_count integer,
  target_stored_count integer,
  target_updated_count integer,
  target_duplicate_count integer,
  target_failed_count integer,
  target_analyzed_count integer,
  target_quota_units_used integer,
  target_reply_cursor text default null
)
returns public.channel_comment_sync_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  completed_run public.channel_comment_sync_runs;
  target_setting public.channel_comment_sync_settings;
  target_setting_id uuid;
  reached_end boolean;
begin
  if target_observed_count < 0
    or target_stored_count < 0
    or target_updated_count < 0
    or target_duplicate_count < 0
    or target_failed_count < 0
    or target_analyzed_count < 0
    or target_quota_units_used < 0
  then
    raise exception 'sync run counts cannot be negative' using errcode = '22023';
  end if;

  select r.setting_id
  into target_setting_id
  from public.channel_comment_sync_runs r
  where r.id = target_run_id;

  if target_setting_id is null then
    raise exception 'channel sync run not found' using errcode = 'P0002';
  end if;

  select s.*
  into target_setting
  from public.channel_comment_sync_settings s
  where s.id = target_setting_id
  for update;

  if target_setting.id is null then
    raise exception 'channel sync setting not found' using errcode = 'P0002';
  end if;

  select r.*
  into completed_run
  from public.channel_comment_sync_runs r
  where r.id = target_run_id
  for update;

  if completed_run.id is null then
    raise exception 'channel sync run not found' using errcode = 'P0002';
  end if;

  if completed_run.claim_token is distinct from target_claim_token then
    raise exception 'channel sync lease claim is stale' using errcode = '40001';
  end if;

  if completed_run.status = 'succeeded' then
    return completed_run;
  end if;

  if completed_run.status <> 'running' then
    raise exception 'channel sync run is not running' using errcode = '55000';
  end if;

  if target_setting.lease_until is null
    or target_setting.lease_until <= now()
  then
    raise exception 'channel sync lease claim is stale' using errcode = '40001';
  end if;

  reached_end :=
    coalesce(target_reached_boundary, false)
    or target_next_page_token is null;

  update public.channel_comment_sync_runs
  set
    status = 'succeeded',
    output_page_token = case
      when completed_run.kind = 'reply_reconciliation'
        then target_reply_cursor
      else target_next_page_token
    end,
    observed_count = target_observed_count,
    stored_count = target_stored_count,
    updated_count = target_updated_count,
    duplicate_count = target_duplicate_count,
    failed_count = target_failed_count,
    analyzed_count = target_analyzed_count,
    quota_units_used = target_quota_units_used,
    error_code = null,
    finished_at = now()
  where id = completed_run.id
  returning * into completed_run;

  update public.channel_comment_sync_settings
  set
    backfill_status = case
      when completed_run.kind = 'backfill_recent' and reached_end
        then 'completed'
      when completed_run.kind = 'backfill_recent'
        then 'pending'
      else backfill_status
    end,
    backfill_page_token = case
      when completed_run.kind = 'backfill_recent' and reached_end
        then null
      when completed_run.kind = 'backfill_recent'
        then target_next_page_token
      else backfill_page_token
    end,
    incremental_page_token = case
      when completed_run.kind = 'incremental' and reached_end
        then null
      when completed_run.kind = 'incremental'
        then target_next_page_token
      else incremental_page_token
    end,
    last_successful_sync_at = case
      when completed_run.kind = 'incremental' and reached_end
        then coalesce(
          incremental_scan_started_at,
          completed_run.started_at,
          now()
        )
      else last_successful_sync_at
    end,
    incremental_scan_started_at = case
      when completed_run.kind = 'incremental' and reached_end
        then null
      else incremental_scan_started_at
    end,
    reply_reconciliation_status = case
      when completed_run.kind = 'reply_reconciliation'
        and target_reply_cursor is null
        then 'completed'
      when completed_run.kind = 'reply_reconciliation'
        then 'pending'
      else reply_reconciliation_status
    end,
    reply_reconciliation_page_token = case
      when completed_run.kind = 'reply_reconciliation'
        then target_reply_cursor
      else reply_reconciliation_page_token
    end,
    last_reply_reconciliation_at = case
      when completed_run.kind = 'reply_reconciliation'
        and target_reply_cursor is null
        then now()
      else last_reply_reconciliation_at
    end,
    next_reply_reconciliation_at = case
      when completed_run.kind = 'reply_reconciliation'
        and target_reply_cursor is null
        then now() + interval '24 hours'
      when completed_run.kind = 'reply_reconciliation'
        then now()
      else next_reply_reconciliation_at
    end,
    next_sync_at = case
      when completed_run.kind = 'incremental' and reached_end
        then now() + make_interval(mins => sync_interval_minutes)
      when completed_run.kind = 'incremental'
        then now()
      else next_sync_at
    end,
    lease_until = null,
    last_error_code = null,
    updated_at = now()
  where id = target_setting.id;

  return completed_run;
end;
$$;

create function public.fail_channel_comment_sync_run(
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
  select r.setting_id
  into target_setting_id
  from public.channel_comment_sync_runs r
  where r.id = target_run_id;

  if target_setting_id is null then
    raise exception 'channel sync run not found' using errcode = 'P0002';
  end if;

  select s.*
  into target_setting
  from public.channel_comment_sync_settings s
  where s.id = target_setting_id
  for update;

  if target_setting.id is null then
    raise exception 'channel sync setting not found' using errcode = 'P0002';
  end if;

  select r.*
  into failed_run
  from public.channel_comment_sync_runs r
  where r.id = target_run_id
  for update;

  if failed_run.id is null then
    raise exception 'channel sync run not found' using errcode = 'P0002';
  end if;

  if failed_run.claim_token is distinct from target_claim_token then
    raise exception 'channel sync lease claim is stale' using errcode = '40001';
  end if;

  if failed_run.status = 'failed' then
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

revoke all on function public.configure_channel_comment_sync(uuid, date)
  from public, anon;
revoke all on function public.set_channel_comment_sync_enabled(uuid, boolean)
  from public, anon;
revoke all on function public.request_channel_comment_sync_now(uuid)
  from public, anon;
revoke all on function public.claim_channel_comment_sync_work_internal(
  uuid,
  integer,
  integer
) from public, anon, authenticated, service_role;
revoke all on function public.claim_channel_comment_sync_work(integer, integer)
  from public, anon, authenticated;
revoke all on function public.claim_channel_comment_sync_work_for_workspace(
  uuid,
  uuid,
  integer
) from public, anon, authenticated;
revoke all on function public.complete_channel_comment_sync_run(
  uuid,
  uuid,
  text,
  boolean,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  text
) from public, anon, authenticated;
revoke all on function public.fail_channel_comment_sync_run(uuid, uuid, text)
  from public, anon, authenticated;
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

grant execute on function public.configure_channel_comment_sync(uuid, date)
  to authenticated, service_role;
grant execute on function public.set_channel_comment_sync_enabled(uuid, boolean)
  to authenticated, service_role;
grant execute on function public.request_channel_comment_sync_now(uuid)
  to authenticated, service_role;
grant execute on function public.claim_channel_comment_sync_work(integer, integer)
  to service_role;
grant execute on function public.claim_channel_comment_sync_work_for_workspace(
  uuid,
  uuid,
  integer
) to service_role;
grant execute on function public.complete_channel_comment_sync_run(
  uuid,
  uuid,
  text,
  boolean,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  text
) to service_role;
grant execute on function public.fail_channel_comment_sync_run(uuid, uuid, text)
  to service_role;
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
