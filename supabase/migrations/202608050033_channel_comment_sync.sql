create extension if not exists pgcrypto with schema extensions;

create table public.channel_comment_sync_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique
    references public.workspaces(id) on delete cascade,
  connection_id uuid not null
    references public.youtube_connections(id) on delete cascade,
  youtube_channel_id text not null,
  enabled boolean not null default true,
  backfill_start_at timestamptz not null,
  sync_interval_minutes integer not null default 60
    check (sync_interval_minutes = 60),
  backfill_status text not null default 'pending'
    check (backfill_status in ('pending', 'running', 'completed', 'failed')),
  backfill_page_token text,
  incremental_page_token text,
  reply_reconciliation_status text not null default 'pending'
    check (
      reply_reconciliation_status
        in ('pending', 'running', 'completed', 'failed')
    ),
  reply_reconciliation_page_token text,
  last_successful_sync_at timestamptz,
  last_reply_reconciliation_at timestamptz,
  next_reply_reconciliation_at timestamptz,
  next_sync_at timestamptz not null default now(),
  lease_until timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (connection_id, youtube_channel_id)
    references public.youtube_channel_candidates(
      connection_id,
      youtube_channel_id
    ) on delete cascade
);

create table public.channel_comment_sync_runs (
  id uuid primary key default gen_random_uuid(),
  setting_id uuid not null
    references public.channel_comment_sync_settings(id) on delete cascade,
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,
  kind text not null
    check (kind in ('backfill_recent', 'incremental', 'reply_reconciliation')),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed')),
  input_page_token text,
  output_page_token text,
  observed_count integer not null default 0 check (observed_count >= 0),
  stored_count integer not null default 0 check (stored_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  analyzed_count integer not null default 0 check (analyzed_count >= 0),
  quota_units_used integer not null default 0 check (quota_units_used >= 0),
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index channel_comment_sync_runs_one_active
  on public.channel_comment_sync_runs(setting_id)
  where status in ('pending', 'running');

create index channel_comment_sync_runs_workspace_created
  on public.channel_comment_sync_runs(workspace_id, created_at desc);

alter table public.comment_import_jobs
  add column channel_sync_run_id uuid
    references public.channel_comment_sync_runs(id) on delete set null,
  add column trigger_kind text not null default 'manual'
    check (trigger_kind in ('manual', 'channel_sync')),
  add column updated_count integer not null default 0
    check (updated_count >= 0);

alter table public.comment_import_jobs
  drop constraint comment_import_jobs_source_contract;

alter table public.comment_import_jobs
  add constraint comment_import_jobs_source_contract check (
    (
      source_kind = 'owned_oauth'
      and trigger_kind = 'manual'
      and channel_sync_run_id is null
      and requested_top_level_count between 20 and 50
      and requested_total_count is null
      and source_video_url is null
    )
    or
    (
      source_kind = 'owned_oauth'
      and trigger_kind = 'channel_sync'
      and channel_sync_run_id is not null
      and requested_top_level_count is null
      and requested_total_count is null
      and source_video_url is null
    )
    or
    (
      source_kind = 'public_url'
      and trigger_kind = 'manual'
      and channel_sync_run_id is null
      and requested_top_level_count is null
      and requested_total_count in (20, 50, 100, 1000)
      and source_video_url
        ~ '^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}$'
    )
  );

create table public.comment_source_observations (
  id uuid primary key default gen_random_uuid(),
  raw_comment_id uuid not null
    references public.raw_comments(id) on delete cascade,
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,
  import_job_id uuid not null
    references public.comment_import_jobs(id) on delete cascade,
  fingerprint text not null,
  source_snapshot jsonb not null,
  provider_payload jsonb not null,
  provider_updated_at timestamptz,
  captured_at timestamptz not null default now(),
  unique (raw_comment_id, fingerprint)
);

create index comment_source_observations_workspace_captured
  on public.comment_source_observations(workspace_id, captured_at desc);

alter table public.channel_comment_sync_settings enable row level security;
alter table public.channel_comment_sync_runs enable row level security;
alter table public.comment_source_observations enable row level security;

create policy channel_comment_sync_settings_member_select
  on public.channel_comment_sync_settings
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy channel_comment_sync_runs_member_select
  on public.channel_comment_sync_runs
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

revoke all on public.channel_comment_sync_settings
  from public, anon, authenticated;
revoke all on public.channel_comment_sync_runs
  from public, anon, authenticated;
revoke all on public.comment_source_observations
  from public, anon, authenticated;

grant select on public.channel_comment_sync_settings to authenticated;
grant select on public.channel_comment_sync_runs to authenticated;
grant all on public.channel_comment_sync_settings to service_role;
grant all on public.channel_comment_sync_runs to service_role;
grant all on public.comment_source_observations to service_role;

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
    error_code = 'reconfigured',
    finished_at = now()
  where setting_id = configured_setting.id
    and status in ('pending', 'running');

  return configured_setting;
end;
$$;

create or replace function public.set_channel_comment_sync_enabled(
  target_workspace_id uuid,
  target_enabled boolean
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
    enabled = target_enabled,
    next_sync_at = case when target_enabled then now() else next_sync_at end,
    lease_until = case when target_enabled then null else lease_until end,
    updated_at = now()
  where workspace_id = target_workspace_id
  returning * into changed_setting;

  if changed_setting.id is null then
    raise exception 'channel sync is not configured' using errcode = 'P0002';
  end if;

  return changed_setting;
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
    lease_until = null,
    updated_at = now()
  where workspace_id = target_workspace_id
  returning * into changed_setting;

  if changed_setting.id is null then
    raise exception 'channel sync is not configured' using errcode = 'P0002';
  end if;

  return changed_setting;
end;
$$;

create or replace function public.claim_channel_comment_sync_work(
  target_limit integer default 1,
  target_lease_seconds integer default 240
)
returns table (
  setting_id uuid,
  run_id uuid,
  workspace_id uuid,
  connection_id uuid,
  youtube_channel_id text,
  run_kind text,
  backfill_start_at timestamptz,
  page_token text,
  last_successful_sync_at timestamptz
)
language plpgsql
security definer
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
    where s.enabled
      and (s.lease_until is null or s.lease_until <= now())
      and (
        s.backfill_status <> 'completed'
        or s.next_sync_at <= now()
        or s.reply_reconciliation_status in ('pending', 'running')
        or (
          s.next_reply_reconciliation_at is not null
          and s.next_reply_reconciliation_at <= now()
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
        input_page_token,
        started_at
      )
      values (
        claimed_setting.id,
        claimed_setting.workspace_id,
        next_kind,
        'running',
        next_token,
        now()
      )
      returning * into claimed_run;
    else
      update public.channel_comment_sync_runs
      set
        status = 'running',
        started_at = coalesce(started_at, now())
      where id = claimed_run.id
      returning * into claimed_run;
    end if;

    update public.channel_comment_sync_settings
    set
      lease_until =
        now() + make_interval(secs => greatest(target_lease_seconds, 30)),
      backfill_status = case
        when claimed_run.kind = 'backfill_recent' then 'running'
        else backfill_status
      end,
      reply_reconciliation_status = case
        when claimed_run.kind = 'reply_reconciliation' then 'running'
        else reply_reconciliation_status
      end,
      updated_at = now()
    where id = claimed_setting.id;

    setting_id := claimed_setting.id;
    run_id := claimed_run.id;
    workspace_id := claimed_setting.workspace_id;
    connection_id := claimed_setting.connection_id;
    youtube_channel_id := claimed_setting.youtube_channel_id;
    run_kind := claimed_run.kind;
    backfill_start_at := claimed_setting.backfill_start_at;
    page_token := claimed_run.input_page_token;
    last_successful_sync_at := claimed_setting.last_successful_sync_at;
    return next;
  end loop;
end;
$$;

create or replace function public.store_import_comment_item(
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
returns table (
  disposition text,
  raw_comment_id uuid
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_raw_comment_id uuid;
  inserted_raw_comment_id uuid;
  observation_fingerprint text;
  observation_inserted integer;
  source_snapshot jsonb;
begin
  if not exists (
    select 1
    from public.comment_import_jobs cij
    where cij.id = target_import_job_id
      and cij.workspace_id = target_workspace_id
      and cij.youtube_video_id = target_youtube_video_id
  ) then
    raise exception 'import job scope mismatch' using errcode = '42501';
  end if;

  source_snapshot := jsonb_build_object(
    'youtubeVideoId', target_youtube_video_id,
    'youtubeCommentId', target_youtube_comment_id,
    'parentYoutubeCommentId', target_parent_youtube_comment_id,
    'authorChannelId', target_author_channel_id,
    'authorDisplayName', target_author_display_name,
    'authorAvatarUrl', target_author_avatar_url,
    'textDisplay', target_text_display,
    'textOriginal', target_text_original,
    'likeCount', greatest(target_like_count, 0),
    'sourceModerationStatus', target_source_moderation_status,
    'publishedAt', target_published_at,
    'updatedAt', target_updated_at
  );

  observation_fingerprint := encode(
    digest(
      convert_to(
        source_snapshot::text || coalesce(target_payload, '{}'::jsonb)::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.raw_comments (
    workspace_id,
    youtube_video_id,
    youtube_comment_id,
    parent_youtube_comment_id,
    author_channel_id,
    author_display_name,
    author_avatar_url,
    text_display,
    text_original,
    like_count,
    source_moderation_status,
    published_at,
    updated_at,
    first_import_job_id
  )
  values (
    target_workspace_id,
    target_youtube_video_id,
    target_youtube_comment_id,
    target_parent_youtube_comment_id,
    target_author_channel_id,
    target_author_display_name,
    target_author_avatar_url,
    target_text_display,
    target_text_original,
    greatest(target_like_count, 0),
    target_source_moderation_status,
    target_published_at,
    target_updated_at,
    target_import_job_id
  )
  on conflict (workspace_id, youtube_comment_id) do nothing
  returning id into inserted_raw_comment_id;

  if inserted_raw_comment_id is not null then
    target_raw_comment_id := inserted_raw_comment_id;

    insert into public.raw_comment_payloads (
      raw_comment_id,
      workspace_id,
      payload
    )
    values (
      target_raw_comment_id,
      target_workspace_id,
      target_payload
    );
  else
    select rc.id
    into target_raw_comment_id
    from public.raw_comments rc
    where rc.workspace_id = target_workspace_id
      and rc.youtube_comment_id = target_youtube_comment_id;
  end if;

  insert into public.comment_source_observations (
    raw_comment_id,
    workspace_id,
    import_job_id,
    fingerprint,
    source_snapshot,
    provider_payload,
    provider_updated_at
  )
  values (
    target_raw_comment_id,
    target_workspace_id,
    target_import_job_id,
    observation_fingerprint,
    source_snapshot,
    coalesce(target_payload, '{}'::jsonb),
    target_updated_at
  )
  on conflict on constraint
    comment_source_observations_raw_comment_id_fingerprint_key
  do nothing;

  get diagnostics observation_inserted = row_count;

  insert into public.comment_import_items (
    import_job_id,
    workspace_id,
    youtube_comment_id,
    status,
    raw_comment_id,
    error_code
  )
  values (
    target_import_job_id,
    target_workspace_id,
    target_youtube_comment_id,
    'succeeded',
    target_raw_comment_id,
    null
  )
  on conflict (import_job_id, youtube_comment_id) do update
  set
    status = excluded.status,
    raw_comment_id = excluded.raw_comment_id,
    error_code = null;

  disposition := case
    when inserted_raw_comment_id is not null then 'stored'
    when observation_inserted > 0 then 'updated'
    else 'duplicate'
  end;
  raw_comment_id := target_raw_comment_id;
  return next;
end;
$$;

revoke all on function public.configure_channel_comment_sync(uuid, date)
  from public, anon;
revoke all on function public.set_channel_comment_sync_enabled(uuid, boolean)
  from public, anon;
revoke all on function public.request_channel_comment_sync_now(uuid)
  from public, anon;
revoke all on function public.claim_channel_comment_sync_work(integer, integer)
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
