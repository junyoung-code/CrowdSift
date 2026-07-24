create type public.comment_source_kind as enum (
  'owned_oauth',
  'public_url'
);

alter table public.comment_import_jobs
  alter column requested_top_level_count drop not null,
  add column source_kind public.comment_source_kind
    not null default 'owned_oauth',
  add column requested_total_count integer,
  add column source_video_url text,
  add column youtube_quota_units_used integer
    not null default 0 check (youtube_quota_units_used >= 0),
  add column top_level_count integer
    not null default 0 check (top_level_count >= 0),
  add column reply_count integer
    not null default 0 check (reply_count >= 0),
  add constraint comment_import_jobs_source_contract check (
    (
      source_kind = 'owned_oauth'
      and requested_top_level_count between 20 and 50
      and requested_total_count is null
      and source_video_url is null
    )
    or
    (
      source_kind = 'public_url'
      and requested_top_level_count is null
      and requested_total_count in (20, 50, 100, 1000)
      and source_video_url
        ~ '^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}$'
    )
  );

create or replace function public.enforce_public_import_item_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_source_kind public.comment_source_kind;
  target_requested_total_count integer;
  target_workspace_id uuid;
  current_item_count integer;
begin
  select
    cij.source_kind,
    cij.requested_total_count,
    cij.workspace_id
  into
    target_source_kind,
    target_requested_total_count,
    target_workspace_id
  from public.comment_import_jobs cij
  where cij.id = new.import_job_id
  for update;

  if target_source_kind is null then
    raise exception 'import job not found' using errcode = 'P0002';
  end if;

  if new.workspace_id is distinct from target_workspace_id then
    raise exception 'import job workspace mismatch' using errcode = '42501';
  end if;

  if target_source_kind <> 'public_url' then
    return new;
  end if;

  if exists (
    select 1
    from public.comment_import_items cii
    where cii.import_job_id = new.import_job_id
      and cii.youtube_comment_id = new.youtube_comment_id
  ) then
    return new;
  end if;

  select count(*)::integer
  into current_item_count
  from public.comment_import_items cii
  where cii.import_job_id = new.import_job_id;

  if current_item_count >= target_requested_total_count then
    raise exception 'public import item limit exceeded';
  end if;

  return new;
end;
$$;

create trigger public_import_item_limit
before insert on public.comment_import_items
for each row execute function public.enforce_public_import_item_limit();

alter table public.creator_feedback
  add column source_import_job_id uuid
    references public.comment_import_jobs(id) on delete restrict;

update public.creator_feedback cf
set source_import_job_id = rc.first_import_job_id
from public.raw_comments rc
where rc.id = cf.raw_comment_id
  and rc.workspace_id = cf.workspace_id;

create or replace function public.enforce_feedback_source_policy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  source_was_explicit boolean;
  fallback_import_job_id uuid;
  target_source_kind public.comment_source_kind;
begin
  source_was_explicit :=
    tg_op = 'INSERT' and new.source_import_job_id is not null;

  if new.source_import_job_id is null then
    select rc.first_import_job_id
    into fallback_import_job_id
    from public.raw_comments rc
    where rc.id = new.raw_comment_id
      and rc.workspace_id = new.workspace_id;

    new.source_import_job_id := fallback_import_job_id;
  end if;

  select cij.source_kind
  into target_source_kind
  from public.comment_import_jobs cij
  where cij.id = new.source_import_job_id
    and cij.workspace_id = new.workspace_id
    and cij.youtube_video_id = (
      select rc.youtube_video_id
      from public.raw_comments rc
      where rc.id = new.raw_comment_id
        and rc.workspace_id = new.workspace_id
    );

  if target_source_kind is null then
    raise exception 'feedback source observation mismatch'
      using errcode = '42501';
  end if;

  if source_was_explicit and not exists (
    select 1
    from public.comment_import_items cii
    where cii.import_job_id = new.source_import_job_id
      and cii.workspace_id = new.workspace_id
      and cii.raw_comment_id = new.raw_comment_id
  ) then
    raise exception 'feedback source observation mismatch'
      using errcode = '42501';
  end if;

  if target_source_kind = 'public_url'
    and (new.use_for_personalization or new.use_for_training)
  then
    raise exception 'public source feedback cannot enable personalization or training'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
    and new.source_import_job_id is distinct from old.source_import_job_id
  then
    raise exception 'feedback source observation is immutable'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger creator_feedback_source_policy
before insert or update on public.creator_feedback
for each row execute function public.enforce_feedback_source_policy();

alter table public.moderation_action_requests
  add column source_import_job_id uuid
    references public.comment_import_jobs(id) on delete restrict;

update public.moderation_action_requests mar
set source_import_job_id = rc.first_import_job_id
from public.raw_comments rc
where rc.id = mar.raw_comment_id
  and rc.workspace_id = mar.workspace_id;

alter table public.moderation_action_requests
  alter column source_import_job_id set not null;

create or replace function public.enforce_moderation_source_policy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  source_was_explicit boolean;
  fallback_import_job_id uuid;
  target_source_kind public.comment_source_kind;
begin
  source_was_explicit :=
    tg_op = 'INSERT' and new.source_import_job_id is not null;

  if new.source_import_job_id is null then
    select rc.first_import_job_id
    into fallback_import_job_id
    from public.raw_comments rc
    where rc.id = new.raw_comment_id
      and rc.workspace_id = new.workspace_id;

    new.source_import_job_id := fallback_import_job_id;
  end if;

  select cij.source_kind
  into target_source_kind
  from public.comment_import_jobs cij
  where cij.id = new.source_import_job_id
    and cij.workspace_id = new.workspace_id
    and cij.youtube_video_id = (
      select rc.youtube_video_id
      from public.raw_comments rc
      where rc.id = new.raw_comment_id
        and rc.workspace_id = new.workspace_id
    );

  if target_source_kind is null then
    raise exception 'moderation source observation mismatch'
      using errcode = '42501';
  end if;

  if source_was_explicit and not exists (
    select 1
    from public.comment_import_items cii
    where cii.import_job_id = new.source_import_job_id
      and cii.workspace_id = new.workspace_id
      and cii.raw_comment_id = new.raw_comment_id
  ) then
    raise exception 'moderation source observation mismatch'
      using errcode = '42501';
  end if;

  if target_source_kind = 'public_url' then
    raise exception 'public source comments are read-only'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
    and new.source_import_job_id is distinct from old.source_import_job_id
  then
    raise exception 'moderation source observation is immutable'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger moderation_request_source_policy
before insert or update on public.moderation_action_requests
for each row execute function public.enforce_moderation_source_policy();
