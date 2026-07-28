drop function public.get_inbox_page(
  uuid,
  public.review_level[],
  public.comment_category,
  text,
  text,
  public.action_state,
  text,
  real,
  real,
  integer,
  integer
);

create function public.get_inbox_page(
  target_workspace_id uuid,
  review_levels public.review_level[] default array[
    'caution'::public.review_level,
    'risk'::public.review_level
  ],
  category_filter public.comment_category default null,
  video_id text default null,
  analysis_state_filter text default null,
  action_state_filter public.action_state default null,
  search_query text default null,
  min_confidence real default null,
  max_confidence real default null,
  page_size integer default 25,
  page_offset integer default 0
)
returns table (
  raw_comment_id uuid,
  source_import_job_id uuid,
  source_kind public.comment_source_kind,
  youtube_video_id text,
  author_display_name text,
  author_avatar_url text,
  published_at timestamptz,
  source_available boolean,
  safe_source_text text,
  analysis_id uuid,
  category public.comment_category,
  review_level public.review_level,
  confidence real,
  recommended_action public.recommended_action,
  manual_review boolean,
  neutral_text text,
  normalized_question text,
  analysis_state text,
  action_state public.action_state,
  delete_eligible boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_member(target_workspace_id) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;

  if analysis_state_filter is not null
    and analysis_state_filter not in ('analyzed', 'pending', 'failed')
  then
    raise exception 'invalid analysis state' using errcode = '22023';
  end if;

  return query
  with selected_channel as (
    select ycc.youtube_channel_id
    from public.youtube_channel_candidates ycc
    join public.youtube_connections yc
      on yc.id = ycc.connection_id
      and yc.workspace_id = ycc.workspace_id
    where ycc.workspace_id = target_workspace_id
      and ycc.selected
      and yc.status = 'connected'
    limit 1
  ),
  inbox_rows as (
    select
      rc.id as raw_comment_id,
      cii.import_job_id as source_import_job_id,
      cij.source_kind,
      rc.youtube_video_id,
      rc.author_display_name,
      rc.author_avatar_url,
      rc.published_at,
      rc.source_deleted_at is null as source_available,
      case
        when cca.review_level = 'safe'::public.review_level
          and rc.source_deleted_at is null
        then rc.text_display
        else null
      end as safe_source_text,
      rc.text_display as source_search_text,
      cca.id as analysis_id,
      cca.category,
      cca.review_level,
      cca.confidence,
      cca.recommended_action,
      cca.manual_review,
      sf.neutral_text,
      sf.normalized_question,
      case
        when cca.id is not null then 'analyzed'
        when observation_analysis.status = 'failed' then 'failed'
        else 'pending'
      end as analysis_state,
      latest_action.state as action_state,
      (
        cij.source_kind = 'owned_oauth'
        and rc.author_channel_id is not null
        and rc.author_channel_id = (
          select sc.youtube_channel_id from selected_channel sc
        )
      ) as delete_eligible,
      coalesce(cca.created_at, cii.created_at) as priority_at
    from public.comment_import_items cii
    join public.comment_import_jobs cij
      on cij.id = cii.import_job_id
      and cij.workspace_id = cii.workspace_id
    join public.raw_comments rc
      on rc.id = cii.raw_comment_id
      and rc.workspace_id = cii.workspace_id
    left join public.current_comment_analyses cca
      on cca.raw_comment_id = rc.id
      and cca.workspace_id = rc.workspace_id
    left join public.sanitized_feedback sf
      on sf.analysis_id = cca.id
      and sf.workspace_id = rc.workspace_id
    left join lateral (
      select aji.status
      from public.analysis_job_items aji
      join public.analysis_jobs aj
        on aj.id = aji.analysis_job_id
        and aj.workspace_id = aji.workspace_id
      where aji.workspace_id = rc.workspace_id
        and aji.raw_comment_id = rc.id
        and aj.import_job_id = cii.import_job_id
      order by aji.created_at desc, aji.id desc
      limit 1
    ) observation_analysis on true
    left join lateral (
      select mar.state
      from public.moderation_action_requests mar
      where mar.workspace_id = rc.workspace_id
        and mar.raw_comment_id = rc.id
        and mar.source_import_job_id = cii.import_job_id
      order by mar.created_at desc, mar.id desc
      limit 1
    ) latest_action on true
    where cii.workspace_id = target_workspace_id
      and cii.raw_comment_id is not null
      and cii.status = 'succeeded'
  )
  select
    ir.raw_comment_id,
    ir.source_import_job_id,
    ir.source_kind,
    ir.youtube_video_id,
    ir.author_display_name,
    ir.author_avatar_url,
    ir.published_at,
    ir.source_available,
    ir.safe_source_text,
    ir.analysis_id,
    ir.category,
    ir.review_level,
    ir.confidence,
    ir.recommended_action,
    ir.manual_review,
    ir.neutral_text,
    ir.normalized_question,
    ir.analysis_state,
    ir.action_state,
    ir.delete_eligible,
    count(*) over ()::bigint
  from inbox_rows ir
  where (
      analysis_state_filter is null
      or ir.analysis_state = analysis_state_filter
    )
    and (
      analysis_state_filter in ('pending', 'failed')
      or review_levels is null
      or ir.review_level = any(review_levels)
    )
    and (
      category_filter is null
      or ir.category = category_filter
    )
    and (
      video_id is null
      or ir.youtube_video_id = video_id
    )
    and (
      action_state_filter is null
      or ir.action_state = action_state_filter
    )
    and (
      min_confidence is null
      or ir.confidence >= min_confidence
    )
    and (
      max_confidence is null
      or ir.confidence <= max_confidence
    )
    and (
      search_query is null
      or search_query = ''
      or coalesce(ir.neutral_text, '') ilike '%' || search_query || '%'
      or coalesce(ir.normalized_question, '') ilike '%' || search_query || '%'
      or ir.source_search_text ilike '%' || search_query || '%'
    )
  order by
    case ir.review_level
      when 'risk' then 0
      when 'caution' then 1
      when 'safe' then 2
      else 3
    end,
    ir.priority_at desc,
    ir.raw_comment_id desc,
    ir.source_import_job_id desc
  limit least(greatest(page_size, 1), 100)
  offset greatest(page_offset, 0);
end;
$$;

revoke all on function public.get_inbox_page(
  uuid,
  public.review_level[],
  public.comment_category,
  text,
  text,
  public.action_state,
  text,
  real,
  real,
  integer,
  integer
) from public;

grant execute on function public.get_inbox_page(
  uuid,
  public.review_level[],
  public.comment_category,
  text,
  text,
  public.action_state,
  text,
  real,
  real,
  integer,
  integer
) to authenticated, service_role;

create or replace function public.get_acknowledged_comment_source(
  target_workspace_id uuid,
  target_raw_comment_id uuid
)
returns table (
  author_display_name text,
  author_avatar_url text,
  published_at timestamptz,
  text_display text,
  captured_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or not public.is_workspace_member(target_workspace_id)
  then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;

  return query
  select
    rc.author_display_name,
    rc.author_avatar_url,
    rc.published_at,
    rc.text_display,
    rc.captured_at
  from public.raw_comments rc
  where rc.id = target_raw_comment_id
    and rc.workspace_id = target_workspace_id
    and rc.source_deleted_at is null
  limit 1;
end;
$$;

revoke all on function public.get_acknowledged_comment_source(uuid, uuid)
  from public;

grant execute on function public.get_acknowledged_comment_source(uuid, uuid)
  to authenticated, service_role;
