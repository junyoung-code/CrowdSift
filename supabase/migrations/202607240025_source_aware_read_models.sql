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
  latest_analysis_cost jsonb,
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
  ),
  latest_analysis as (
    select aj.*, li.source_kind
    from public.analysis_jobs aj
    join latest_import li on li.id = aj.import_job_id
    where aj.workspace_id = target_workspace_id
    order by aj.created_at desc, aj.id desc
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
        'id', li.id,
        'sourceKind', li.source_kind,
        'status', li.status,
        'requestedTopLevelCount', li.requested_top_level_count,
        'requestedTotalCount', li.requested_total_count,
        'fetchedCount', li.fetched_count,
        'storedCount', li.stored_count,
        'duplicateCount', li.duplicate_count,
        'failedCount', li.failed_count,
        'topLevelCount', li.top_level_count,
        'replyCount', li.reply_count,
        'youtubeQuotaUnitsUsed', li.youtube_quota_units_used,
        'createdAt', li.created_at
      )
      from latest_import li
      limit 1
    ),
    (
      select jsonb_build_object(
        'id', la.id,
        'sourceKind', la.source_kind,
        'status', la.status,
        'totalCount', la.total_count,
        'completedCount', la.completed_count,
        'failedCount', la.failed_count,
        'createdAt', la.created_at
      )
      from latest_analysis la
      limit 1
    ),
    (
      select jsonb_build_object(
        'currency', ajc.currency,
        'pricingVersion', ajc.pricing_version,
        'estimatedCostLow', ajc.estimated_cost_low,
        'estimatedCostHigh', ajc.estimated_cost_high,
        'actualCalculatedCost', ajc.actual_calculated_cost,
        'stageOneModel', ajc.stage_one_model,
        'stageTwoModel', ajc.stage_two_model,
        'embeddingModel', ajc.embedding_model
      )
      from latest_analysis la
      join public.analysis_job_costs ajc
        on ajc.analysis_job_id = la.id
        and ajc.workspace_id = la.workspace_id
      order by ajc.created_at desc
      limit 1
    ),
    coalesce(
      (
        select jsonb_agg(
          priority.payload order by priority.sort_level, priority.created_at desc
        )
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
        select jsonb_agg(
          correction.payload order by correction.created_at desc
        )
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
        select jsonb_agg(
          action_item.payload order by action_item.created_at desc
        )
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
