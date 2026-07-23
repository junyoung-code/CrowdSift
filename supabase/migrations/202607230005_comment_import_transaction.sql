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
set search_path = public
as $$
declare
  inserted_raw_comment_id uuid;
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

  if inserted_raw_comment_id is null then
    select rc.id
    into inserted_raw_comment_id
    from public.raw_comments rc
    where rc.workspace_id = target_workspace_id
      and rc.youtube_comment_id = target_youtube_comment_id;

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
      inserted_raw_comment_id,
      null
    )
    on conflict (import_job_id, youtube_comment_id) do update
    set
      status = excluded.status,
      raw_comment_id = excluded.raw_comment_id,
      error_code = null;

    return query
    select 'duplicate'::text, inserted_raw_comment_id;
    return;
  end if;

  insert into public.raw_comment_payloads (
    raw_comment_id,
    workspace_id,
    payload
  )
  values (
    inserted_raw_comment_id,
    target_workspace_id,
    target_payload
  );

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
    inserted_raw_comment_id,
    null
  )
  on conflict (import_job_id, youtube_comment_id) do update
  set
    status = excluded.status,
    raw_comment_id = excluded.raw_comment_id,
    error_code = null;

  return query
  select 'stored'::text, inserted_raw_comment_id;
end;
$$;

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
