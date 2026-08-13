-- 인박스가 댓글의 **현재 유튜브 상태**를 알게 한다.
--
-- 지금까지는 몰랐다. 그래서 이미 게시된 댓글에도 「게시 승인」 버튼이 떠 있었다.
-- 아무 일도 일어나지 않는 버튼이고, 눌리면 50 유닛만 나간다.
--
-- 값을 세 곳에서 찾는다. 나중 것이 이긴다.
--   1. 우리가 성공시킨 마지막 조치       — 조치 직후에는 이것만이 최신이다
--   2. 마지막으로 다시 읽어 온 관찰 기록  — 크리에이터가 Studio 에서 직접 바꿨을 수 있다
--   3. 최초 수집값                      — 그 밖에 아무것도 없을 때
--
-- 1과 2 중 **시각이 늦은 쪽**을 쓴다. 조치 뒤에 다시 가져왔다면 가져온 것이 진실이고,
-- 가져온 뒤에 조치했다면 조치가 진실이다. `raw_comments` 는 최초 수집을 보존하는 표라
-- 다시 쓰지 않으므로 여기서 덮지 않는다.
--
-- 값이 null 이면 「모른다」는 뜻이다. API 키로 읽던 시절 댓글이 그렇다. 모를 때는
-- 버튼을 가리지 않는다 — 아는 척하는 것보다 낫다.

drop function if exists public.get_inbox_conversation_page(
  uuid,
  public.review_level[],
  public.comment_category,
  text[],
  text,
  public.action_state,
  text,
  real,
  real,
  integer,
  integer
);

create function public.get_inbox_conversation_page(
  target_workspace_id uuid,
  review_levels public.review_level[] default array['caution'::public.review_level, 'risk'::public.review_level],
  category_filter public.comment_category default null,
  video_ids text[] default null,
  analysis_state_filter text default null,
  action_state_filter public.action_state default null,
  search_query text default null,
  min_confidence real default null,
  max_confidence real default null,
  page_size integer default 25,
  page_offset integer default 0
)
returns table(
  raw_comment_id uuid,
  source_import_job_id uuid,
  source_kind public.comment_source_kind,
  youtube_video_id text,
  video_title text,
  video_thumbnail_url text,
  author_display_name text,
  author_avatar_url text,
  published_at timestamp with time zone,
  like_count integer,
  source_available boolean,
  safe_source_text text,
  analysis_id uuid,
  classification_status text,
  classification_trace jsonb,
  category public.comment_category,
  review_level public.review_level,
  ai_review_level public.review_level,
  confidence real,
  recommended_action public.recommended_action,
  manual_review boolean,
  neutral_text text,
  normalized_question text,
  analysis_state text,
  action_state public.action_state,
  source_moderation_status text,
  delete_eligible boolean,
  reply_count bigint,
  replies jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
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
        when reply_verdict.level = 'safe'::public.review_level
          and not reply_verdict.hide_source
          and reply.source_deleted_at is null
        then reply.text_display
        else null
      end as safe_source_text,
      reply_verdict.level as review_level,
      coalesce(reply_rewrite.rewritten, reply_verdict.feedback_core)
        as neutral_text,
      null::text as normalized_question
    from selected_observations reply_observation
    join public.raw_comments reply
      on reply.id = reply_observation.raw_comment_id
      and reply.workspace_id = reply_observation.workspace_id
    join public.raw_comments parent
      on parent.workspace_id = reply.workspace_id
      and parent.youtube_comment_id = reply.parent_youtube_comment_id
    left join lateral (
      select cv.level, cv.hide_source, cv.feedback_core
      from public.classification_verdicts cv
      where cv.workspace_id = reply.workspace_id
        and cv.raw_comment_id = reply.id
      order by cv.created_at desc, cv.id desc
      limit 1
    ) reply_verdict on true
    left join lateral (
      select cr.rewritten
      from public.classification_rewrites cr
      join public.classification_verdicts crv
        on crv.id = cr.classification_verdict_id
      where cr.workspace_id = reply.workspace_id
        and cr.raw_comment_id = reply.id
        and cr.accepted
      order by cr.created_at desc, cr.id desc
      limit 1
    ) reply_rewrite on true
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
        when coalesce(latest_feedback.corrected_level, cv.level)
          = 'safe'::public.review_level
          and not cv.hide_source
          and rc.source_deleted_at is null
        then rc.text_display
        else null
      end as safe_source_text,
      rc.text_display as source_search_text,
      cv.id as analysis_id,
      cv.status as classification_status,
      case when cv.id is null then null else jsonb_build_object(
        'moderation', stage_runs.data -> 'moderation',
        'luna', stage_runs.data -> 'luna',
        'branch', case when cb.id is null then null else jsonb_build_object(
          'outcome', cb.outcome,
          'reasons', cb.reasons,
          'protection', cb.protection
        ) end,
        'terra', stage_runs.data -> 'terra',
        'final', jsonb_build_object(
          'status', cv.status,
          'level', coalesce(latest_feedback.corrected_level, cv.level),
          'basis', cv.basis,
          'hideSource', cv.hide_source,
          'raisedByModeration', cv.raised_by_moderation,
          'reasonCodes', cv.reason_codes,
          'recommendedActions', cv.recommended_actions
        )
      ) end as classification_trace,
      coalesce(
        latest_feedback.corrected_category,
        case cv.feedback_type
          when 'question' then 'question'::public.comment_category
          when 'actionable' then 'constructive_feedback'::public.comment_category
          when 'preference' then 'constructive_feedback'::public.comment_category
          else 'uncertain'::public.comment_category
        end
      ) as category,
      coalesce(latest_feedback.corrected_level, cv.level) as review_level,
      cv.level as ai_review_level,
      null::real as confidence,
      coalesce(
        latest_feedback.corrected_recommended_action,
        case
          when cv.level = 'safe'::public.review_level
            then 'none'::public.recommended_action
          else 'review'::public.recommended_action
        end
      ) as recommended_action,
      cv.status = 'review_queue' as manual_review,
      coalesce(
        latest_feedback.edited_feedback_core,
        verdict_rewrite.rewritten,
        cv.feedback_core
      ) as neutral_text,
      null::text as normalized_question,
      case
        when cv.id is not null then 'analyzed'
        when observation_analysis.status = 'failed' then 'failed'
        else 'pending'
      end as analysis_state,
      latest_action.state as action_state,
      case
        when applied_action.executed_at is not null
          and (
            latest_observation.captured_at is null
            or applied_action.executed_at > latest_observation.captured_at
          )
        then case applied_action.action
          when 'hold_for_review'::public.moderation_action then 'heldForReview'
          when 'publish'::public.moderation_action then 'published'
          when 'reject'::public.moderation_action then 'rejected'
        end
        else coalesce(
          latest_observation.moderation_status,
          rc.source_moderation_status
        )
      end as source_moderation_status,
      (
        selected_observations.source_kind = 'owned_oauth'
        and rc.author_channel_id is not null
        and rc.author_channel_id = (
          select sc.youtube_channel_id from selected_channel sc
        )
      ) as delete_eligible,
      coalesce(reply_threads.reply_count, 0::bigint) as reply_count,
      coalesce(reply_threads.replies, '[]'::jsonb) as replies,
      coalesce(cv.created_at, selected_observations.created_at) as priority_at
    from selected_observations
    join public.raw_comments rc
      on rc.id = selected_observations.raw_comment_id
      and rc.workspace_id = selected_observations.workspace_id
    left join public.youtube_videos yv
      on yv.workspace_id = rc.workspace_id
      and yv.youtube_video_id = rc.youtube_video_id
    left join lateral (
      select verdict.*
      from public.classification_verdicts verdict
      where verdict.workspace_id = rc.workspace_id
        and verdict.raw_comment_id = rc.id
      order by verdict.created_at desc, verdict.id desc
      limit 1
    ) cv on true
    left join public.classification_branches cb
      on cb.analysis_job_item_id = cv.analysis_job_item_id
    left join lateral (
      select jsonb_object_agg(
        csr.stage,
        jsonb_build_object(
          'status', csr.status,
          'modelIdentifier', csr.model_identifier,
          'providerResponseId', csr.provider_response_id,
          'promptVersion', csr.prompt_version,
          'latencyMs', csr.latency_ms,
          'usage', csr.usage,
          'output', csr.output,
          'errorCode', csr.error_code
        )
      ) as data
      from public.classification_stage_runs csr
      where csr.analysis_job_item_id = cv.analysis_job_item_id
    ) stage_runs on true
    left join lateral (
      select
        cf.corrected_level,
        cf.edited_feedback_core,
        cf.corrected_category,
        cf.corrected_recommended_action
      from public.classification_feedback cf
      where cf.workspace_id = rc.workspace_id
        and cf.raw_comment_id = rc.id
      order by cf.created_at desc, cf.id desc
      limit 1
    ) latest_feedback on true
    left join lateral (
      select cr.rewritten
      from public.classification_rewrites cr
      where cr.workspace_id = rc.workspace_id
        and cr.classification_verdict_id = cv.id
        and cr.accepted
      order by cr.created_at desc, cr.id desc
      limit 1
    ) verdict_rewrite on true
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
    -- 위의 latest_action 은 이 가져오기에서 시작된 요청의 진행 상태를 본다.
    -- 아래는 다르다. **성공한 조치**만, 그리고 어느 가져오기에서 눌렀든 상관없이
    -- 본다. 유튜브에 남은 결과에는 우리 쪽 가져오기 경계가 없기 때문이다.
    left join lateral (
      select mar.action, mar.executed_at
      from public.moderation_action_requests mar
      where mar.workspace_id = rc.workspace_id
        and mar.raw_comment_id = rc.id
        and mar.state = 'succeeded'::public.action_state
        and mar.action <> 'delete'::public.moderation_action
      order by mar.executed_at desc nulls last, mar.created_at desc, mar.id desc
      limit 1
    ) applied_action on true
    left join lateral (
      select
        cso.captured_at,
        cso.source_snapshot ->> 'sourceModerationStatus' as moderation_status
      from public.comment_source_observations cso
      where cso.workspace_id = rc.workspace_id
        and cso.raw_comment_id = rc.id
      order by cso.captured_at desc, cso.id desc
      limit 1
    ) latest_observation on true
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
    ir.classification_status,
    ir.classification_trace,
    ir.category,
    ir.review_level,
    ir.ai_review_level,
    ir.confidence,
    ir.recommended_action,
    ir.manual_review,
    ir.neutral_text,
    ir.normalized_question,
    ir.analysis_state,
    ir.action_state,
    ir.source_moderation_status,
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
      or ir.classification_status = 'review_queue'
      or review_levels is null
      or ir.review_level = any(review_levels)
    )
    and (category_filter is null or ir.category = category_filter)
    and (
      video_ids is null
      or cardinality(video_ids) = 0
      or ir.youtube_video_id = any(video_ids)
    )
    and (action_state_filter is null or ir.action_state = action_state_filter)
    and (min_confidence is null or ir.confidence >= min_confidence)
    and (max_confidence is null or ir.confidence <= max_confidence)
    and (
      search_query is null
      or search_query = ''
      or coalesce(ir.neutral_text, '') ilike '%' || search_query || '%'
      or ir.source_search_text ilike '%' || search_query || '%'
    )
  order by
    ir.published_at desc nulls last,
    ir.priority_at desc,
    ir.raw_comment_id desc
  limit least(greatest(page_size, 1), 100)
  offset greatest(page_offset, 0);
end;
$function$;

grant execute on function public.get_inbox_conversation_page(
  uuid,
  public.review_level[],
  public.comment_category,
  text[],
  text,
  public.action_state,
  text,
  real,
  real,
  integer,
  integer
) to authenticated;
