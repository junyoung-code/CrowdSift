drop function public.get_dashboard_summary(uuid);

create function public.get_dashboard_summary(
  target_workspace_id uuid
)
returns table (
  imported_count bigint,
  analyzed_count bigint,
  safe_count bigint,
  caution_count bigint,
  risk_count bigint,
  pending_review_count bigint,
  selected_channel jsonb,
  latest_video jsonb,
  latest_import_job jsonb,
  latest_analysis_job jsonb,
  priority_comments jsonb,
  recent_corrections jsonb,
  recent_actions jsonb,
  latest_summary text,
  latest_summary_source_count integer
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

  return query
  with comment_counts as (
    select count(*)::bigint as imported
    from public.raw_comments rc
    where rc.workspace_id = target_workspace_id
  ),
  analysis_counts as (
    select
      count(*)::bigint as analyzed,
      count(*) filter (where cca.review_level = 'safe')::bigint as safe,
      count(*) filter (where cca.review_level = 'caution')::bigint as caution,
      count(*) filter (where cca.review_level = 'risk')::bigint as risk,
      count(*) filter (
        where cca.review_level in ('caution', 'risk')
      )::bigint as pending_review
    from public.current_comment_analyses cca
    where cca.workspace_id = target_workspace_id
  ),
  latest_import as (
    select cij.*
    from public.comment_import_jobs cij
    where cij.workspace_id = target_workspace_id
    order by cij.created_at desc, cij.id desc
    limit 1
  )
  select
    cc.imported,
    ac.analyzed,
    ac.safe,
    ac.caution,
    ac.risk,
    ac.pending_review,
    (
      select jsonb_build_object(
        'youtubeChannelId', ycc.youtube_channel_id,
        'title', ycc.title,
        'handle', ycc.handle,
        'thumbnailUrl', ycc.thumbnail_url
      )
      from public.youtube_channel_candidates ycc
      join public.youtube_connections yc
        on yc.id = ycc.connection_id
        and yc.workspace_id = ycc.workspace_id
      where ycc.workspace_id = target_workspace_id
        and ycc.selected
        and yc.status = 'connected'
      limit 1
    ),
    (
      select jsonb_build_object(
        'youtubeVideoId', yv.youtube_video_id,
        'title', yv.title,
        'thumbnailUrl', yv.thumbnail_url,
        'publishedAt', yv.published_at
      )
      from latest_import li
      join public.youtube_videos yv
        on yv.workspace_id = li.workspace_id
        and yv.youtube_video_id = li.youtube_video_id
      limit 1
    ),
    (
      select jsonb_build_object(
        'id', cij.id,
        'status', cij.status,
        'requestedTopLevelCount', cij.requested_top_level_count,
        'storedCount', cij.stored_count,
        'failedCount', cij.failed_count,
        'createdAt', cij.created_at
      )
      from latest_import cij
      limit 1
    ),
    (
      select jsonb_build_object(
        'id', aj.id,
        'status', aj.status,
        'totalCount', aj.total_count,
        'completedCount', aj.completed_count,
        'failedCount', aj.failed_count,
        'createdAt', aj.created_at
      )
      from public.analysis_jobs aj
      where aj.workspace_id = target_workspace_id
      order by aj.created_at desc
      limit 1
    ),
    coalesce(
      (
        select jsonb_agg(priority.payload order by priority.sort_level, priority.created_at desc)
        from (
          select
            case cca.review_level
              when 'risk' then 0
              else 1
            end as sort_level,
            cca.created_at,
            jsonb_build_object(
              'rawCommentId', cca.raw_comment_id,
              'reviewLevel', cca.review_level,
              'category', cca.category,
              'sanitizedText', coalesce(sf.neutral_text, sf.normalized_question)
            ) as payload
          from public.current_comment_analyses cca
          left join public.sanitized_feedback sf
            on sf.workspace_id = cca.workspace_id
            and sf.analysis_id = cca.id
          where cca.workspace_id = target_workspace_id
            and cca.review_level in ('caution', 'risk')
          order by
            case cca.review_level when 'risk' then 0 else 1 end,
            cca.created_at desc
          limit 5
        ) priority
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_agg(correction.payload order by correction.created_at desc)
        from (
          select
            cf.created_at,
            jsonb_build_object(
              'id', cf.id,
              'decision', cf.decision,
              'correctedReviewLevel', cf.corrected_review_level,
              'editedSanitizedFeedback', cf.edited_sanitized_feedback,
              'createdAt', cf.created_at
            ) as payload
          from public.creator_feedback cf
          where cf.workspace_id = target_workspace_id
          order by cf.created_at desc
          limit 5
        ) correction
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_agg(action_item.payload order by action_item.created_at desc)
        from (
          select
            mar.created_at,
            jsonb_build_object(
              'id', mar.id,
              'action', mar.action,
              'state', mar.state,
              'createdAt', mar.created_at
            ) as payload
          from public.moderation_action_requests mar
          where mar.workspace_id = target_workspace_id
          order by mar.created_at desc
          limit 5
        ) action_item
      ),
      '[]'::jsonb
    ),
    (
      select was.summary_text
      from public.workspace_analysis_summaries was
      where was.workspace_id = target_workspace_id
      order by was.created_at desc
      limit 1
    ),
    (
      select was.source_analysis_count
      from public.workspace_analysis_summaries was
      where was.workspace_id = target_workspace_id
      order by was.created_at desc
      limit 1
    )
  from comment_counts cc
  cross join analysis_counts ac;
end;
$$;

revoke all on function public.get_dashboard_summary(uuid) from public;

grant execute on function public.get_dashboard_summary(uuid)
  to authenticated, service_role;
