-- Public URL jobs use 0 for 'all'; positive choices keep their existing caps.
-- No table, source content, policy, or role is removed.
begin;

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
      and requested_total_count in (0, 20, 50, 100, 1000)
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

  -- 0 means all publicly retrievable comments; keep the workspace check above.
  if target_source_kind <> 'public_url' or target_requested_total_count = 0 then
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

comment on column public.comment_import_jobs.requested_total_count is
  'Public URL collection limit. 0 means all public comments and replies, determined by exhausting API pages; null is reserved for owned-channel jobs.';

commit;
