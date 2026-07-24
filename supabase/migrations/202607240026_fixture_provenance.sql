alter table public.comment_import_jobs
  add column provider_mode text not null default 'live'
    check (provider_mode in ('live', 'fixture'));

create or replace function public.enforce_public_reply_parent_observation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_source_kind public.comment_source_kind;
  target_parent_youtube_comment_id text;
begin
  if new.raw_comment_id is null then
    return new;
  end if;

  select cij.source_kind
  into target_source_kind
  from public.comment_import_jobs cij
  where cij.id = new.import_job_id
    and cij.workspace_id = new.workspace_id;

  if target_source_kind <> 'public_url' then
    return new;
  end if;

  select rc.parent_youtube_comment_id
  into target_parent_youtube_comment_id
  from public.raw_comments rc
  where rc.id = new.raw_comment_id
    and rc.workspace_id = new.workspace_id;

  if target_parent_youtube_comment_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.comment_import_items parent_item
    join public.raw_comments parent_comment
      on parent_comment.id = parent_item.raw_comment_id
      and parent_comment.workspace_id = parent_item.workspace_id
    where parent_item.import_job_id = new.import_job_id
      and parent_item.workspace_id = new.workspace_id
      and parent_item.status = 'succeeded'
      and parent_comment.youtube_comment_id =
        target_parent_youtube_comment_id
  ) then
    raise exception 'public reply parent observation missing';
  end if;

  return new;
end;
$$;

create trigger public_reply_parent_observation
before insert or update of raw_comment_id, status
on public.comment_import_items
for each row execute function public.enforce_public_reply_parent_observation();
