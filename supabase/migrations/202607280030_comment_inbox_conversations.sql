create or replace function public.get_inbox_conversation_page(
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
  video_title text,
  video_thumbnail_url text,
  author_display_name text,
  author_avatar_url text,
  published_at timestamptz,
  like_count integer,
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
  reply_count bigint,
  replies jsonb,
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
  selected_observations as (
    select distinct on (cii.workspace_id, cii.raw_comment_id)
      cii.workspace_id,
      cii.raw_comment_id,
      cii.import_job_id,
      cii.created_at,
      cij.source_kind
    from public.comment_import_items cii
    join public.comment_import_jobs cij
      on cij.id = cii.import_job_id
      and cij.workspace_id = cii.workspace_id
    where cii.workspace_id = target_workspace_id
      and cii.raw_comment_id is not null
      and cii.status = 'succeeded'
    order by
      cii.workspace_id,
      cii.raw_comment_id,
      case when cij.source_kind = 'owned_oauth' then 0 else 1 end,
      cii.created_at desc,
      cii.import_job_id desc
  ),
  reply_rows as (
    select
      parent.id as parent_raw_comment_id,
      reply.id as reply_raw_comment_id,
      reply.author_display_name,
      reply.author_avatar_url,
      reply.published_at,
      reply.like_count,
      reply.source_deleted_at is null as source_available,
      case
        when reply_analysis.review_level = 'safe'::public.review_level
          and reply.source_deleted_at is null
        then reply.text_display
        else null
      end as safe_source_text,
      reply_analysis.review_level,
      reply_feedback.neutral_text,
      reply_feedback.normalized_question
    from selected_observations reply_observation
    join public.raw_comments reply
      on reply.id = reply_observation.raw_comment_id
      and reply.workspace_id = reply_observation.workspace_id
    join public.raw_comments parent
      on parent.workspace_id = reply.workspace_id
      and parent.youtube_comment_id = reply.parent_youtube_comment_id
    left join public.current_comment_analyses reply_analysis
      on reply_analysis.raw_comment_id = reply.id
      and reply_analysis.workspace_id = reply.workspace_id
    left join public.sanitized_feedback reply_feedback
      on reply_feedback.analysis_id = reply_analysis.id
      and reply_feedback.workspace_id = reply.workspace_id
    where reply.parent_youtube_comment_id is not null
  ),
  reply_threads as (
    select
      rr.parent_raw_comment_id,
      count(*)::bigint as reply_count,
      jsonb_agg(
        jsonb_build_object(
          'rawCommentId', rr.reply_raw_comment_id,
          'authorDisplayName', rr.author_display_name,
          'authorAvatarUrl', rr.author_avatar_url,
          'publishedAt', rr.published_at,
          'likeCount', rr.like_count,
          'reviewLevel', rr.review_level,
          'sourceAvailable', rr.source_available,
          'safeSourceText', rr.safe_source_text,
          'neutralText', rr.neutral_text,
          'normalizedQuestion', rr.normalized_question
        )
        order by rr.published_at asc nulls last, rr.reply_raw_comment_id asc
      ) as replies
    from reply_rows rr
    group by rr.parent_raw_comment_id
  ),
  inbox_rows as (
    select
      rc.id as raw_comment_id,
      selected_observations.import_job_id as source_import_job_id,
      selected_observations.source_kind,
      rc.youtube_video_id,
      yv.title as video_title,
      yv.thumbnail_url as video_thumbnail_url,
      rc.author_display_name,
      rc.author_avatar_url,
      rc.published_at,
      rc.like_count,
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
        selected_observations.source_kind = 'owned_oauth'
        and rc.author_channel_id is not null
        and rc.author_channel_id = (
          select sc.youtube_channel_id from selected_channel sc
        )
      ) as delete_eligible,
      coalesce(reply_threads.reply_count, 0::bigint) as reply_count,
      coalesce(reply_threads.replies, '[]'::jsonb) as replies,
      coalesce(cca.created_at, selected_observations.created_at) as priority_at
    from selected_observations
    join public.raw_comments rc
      on rc.id = selected_observations.raw_comment_id
      and rc.workspace_id = selected_observations.workspace_id
    left join public.youtube_videos yv
      on yv.workspace_id = rc.workspace_id
      and yv.youtube_video_id = rc.youtube_video_id
    left join public.current_comment_analyses cca
      on cca.raw_comment_id = rc.id
      and cca.workspace_id = rc.workspace_id
    left join public.sanitized_feedback sf
      on sf.analysis_id = cca.id
      and sf.workspace_id = rc.workspace_id
    left join reply_threads
      on reply_threads.parent_raw_comment_id = rc.id
    left join lateral (
      select aji.status
      from public.analysis_job_items aji
      join public.analysis_jobs aj
        on aj.id = aji.analysis_job_id
        and aj.workspace_id = aji.workspace_id
      where aji.workspace_id = rc.workspace_id
        and aji.raw_comment_id = rc.id
        and aj.import_job_id = selected_observations.import_job_id
      order by aji.created_at desc, aji.id desc
      limit 1
    ) observation_analysis on true
    left join lateral (
      select mar.state
      from public.moderation_action_requests mar
      where mar.workspace_id = rc.workspace_id
        and mar.raw_comment_id = rc.id
        and mar.source_import_job_id = selected_observations.import_job_id
      order by mar.created_at desc, mar.id desc
      limit 1
    ) latest_action on true
    where rc.parent_youtube_comment_id is null
  )
  select
    ir.raw_comment_id,
    ir.source_import_job_id,
    ir.source_kind,
    ir.youtube_video_id,
    ir.video_title,
    ir.video_thumbnail_url,
    ir.author_display_name,
    ir.author_avatar_url,
    ir.published_at,
    ir.like_count,
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
    ir.reply_count,
    ir.replies,
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
    and (category_filter is null or ir.category = category_filter)
    and (video_id is null or ir.youtube_video_id = video_id)
    and (action_state_filter is null or ir.action_state = action_state_filter)
    and (min_confidence is null or ir.confidence >= min_confidence)
    and (max_confidence is null or ir.confidence <= max_confidence)
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

revoke all on function public.get_inbox_conversation_page(
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

grant execute on function public.get_inbox_conversation_page(
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
