create or replace function public.is_workspace_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target
      and user_id = auth.uid()
  );
$$;

create or replace function public.ensure_owner_workspace()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_workspace_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select id
  into target_workspace_id
  from public.workspaces
  where owner_user_id = current_user_id;

  if target_workspace_id is null then
    insert into public.workspaces (owner_user_id)
    values (current_user_id)
    on conflict (owner_user_id) do nothing
    returning id into target_workspace_id;

    if target_workspace_id is null then
      select id
      into target_workspace_id
      from public.workspaces
      where owner_user_id = current_user_id;
    end if;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (target_workspace_id, current_user_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;

  insert into public.creator_policies (
    workspace_id,
    version,
    category_sensitivity,
    preferred_actions,
    harmful_text_hidden,
    created_by
  )
  values (
    target_workspace_id,
    1,
    '{}',
    '{}',
    true,
    current_user_id
  )
  on conflict (workspace_id, version) do nothing;

  return target_workspace_id;
end;
$$;

create or replace function public.match_creator_feedback(
  target_workspace_id uuid,
  query_embedding vector(1536),
  match_threshold real default 0.78,
  match_count integer default 5
)
returns table (
  feedback_id uuid,
  similarity real,
  decision text,
  corrected_category public.comment_category,
  corrected_review_level public.review_level,
  edited_sanitized_feedback text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if not public.is_workspace_member(target_workspace_id) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;

  return query
  select
    cf.id,
    (1 - (fe.embedding <=> query_embedding))::real,
    cf.decision,
    cf.corrected_category,
    cf.corrected_review_level,
    cf.edited_sanitized_feedback
  from public.feedback_embeddings fe
  join public.creator_feedback cf
    on cf.id = fe.creator_feedback_id
  where fe.workspace_id = target_workspace_id
    and cf.workspace_id = target_workspace_id
    and cf.use_for_personalization
    and fe.deleted_at is null
    and (1 - (fe.embedding <=> query_embedding)) >= match_threshold
  order by fe.embedding <=> query_embedding
  limit least(greatest(match_count, 0), 5);
end;
$$;

create or replace function public.get_dashboard_summary(
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
      where ycc.workspace_id = target_workspace_id
        and ycc.selected
      limit 1
    ),
    (
      select jsonb_build_object(
        'youtubeVideoId', yv.youtube_video_id,
        'title', yv.title,
        'thumbnailUrl', yv.thumbnail_url,
        'publishedAt', yv.published_at
      )
      from public.youtube_videos yv
      where yv.workspace_id = target_workspace_id
      order by yv.captured_at desc
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
      from public.comment_import_jobs cij
      where cij.workspace_id = target_workspace_id
      order by cij.created_at desc
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

create or replace function public.get_inbox_page(
  target_workspace_id uuid,
  review_levels public.review_level[] default array[
    'caution'::public.review_level,
    'risk'::public.review_level
  ],
  category_filter public.comment_category default null,
  video_id text default null,
  search_query text default null,
  min_confidence real default null,
  max_confidence real default null,
  page_size integer default 25,
  page_offset integer default 0
)
returns table (
  raw_comment_id uuid,
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

  return query
  select
    rc.id,
    rc.youtube_video_id,
    rc.author_display_name,
    rc.author_avatar_url,
    rc.published_at,
    rc.source_deleted_at is null,
    cca.id,
    cca.category,
    cca.review_level,
    cca.confidence,
    cca.recommended_action,
    cca.manual_review,
    sf.neutral_text,
    sf.normalized_question,
    count(*) over ()::bigint
  from public.current_comment_analyses cca
  join public.raw_comments rc
    on rc.id = cca.raw_comment_id
    and rc.workspace_id = cca.workspace_id
  left join public.sanitized_feedback sf
    on sf.analysis_id = cca.id
    and sf.workspace_id = cca.workspace_id
  where cca.workspace_id = target_workspace_id
    and (
      review_levels is null
      or cca.review_level = any(review_levels)
    )
    and (
      category_filter is null
      or cca.category = category_filter
    )
    and (
      video_id is null
      or rc.youtube_video_id = video_id
    )
    and (
      min_confidence is null
      or cca.confidence >= min_confidence
    )
    and (
      max_confidence is null
      or cca.confidence <= max_confidence
    )
    and (
      search_query is null
      or search_query = ''
      or coalesce(sf.neutral_text, '') ilike '%' || search_query || '%'
      or coalesce(sf.normalized_question, '') ilike '%' || search_query || '%'
      or rc.text_display ilike '%' || search_query || '%'
    )
  order by
    case cca.review_level
      when 'risk' then 0
      when 'caution' then 1
      else 2
    end,
    cca.created_at desc,
    cca.id desc
  limit least(greatest(page_size, 1), 100)
  offset greatest(page_offset, 0);
end;
$$;

create view public.youtube_connection_overview
with (security_invoker = true)
as
select
  yc.id,
  yc.workspace_id,
  yc.status,
  yc.granted_scopes,
  yc.token_expires_at,
  yc.created_at,
  yc.updated_at
from public.youtube_connections yc;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.youtube_connections enable row level security;
alter table public.youtube_channel_candidates enable row level security;
alter table public.youtube_videos enable row level security;
alter table public.comment_import_jobs enable row level security;
alter table public.raw_comments enable row level security;
alter table public.raw_comment_payloads enable row level security;
alter table public.comment_import_items enable row level security;
alter table public.creator_policies enable row level security;
alter table public.phrase_rules enable row level security;
alter table public.rule_evaluations enable row level security;
alter table public.analysis_jobs enable row level security;
alter table public.analysis_job_items enable row level security;
alter table public.model_runs enable row level security;
alter table public.comment_analyses enable row level security;
alter table public.sanitized_feedback enable row level security;
alter table public.creator_feedback enable row level security;
alter table public.feedback_embeddings enable row level security;
alter table public.workspace_analysis_summaries enable row level security;
alter table public.evaluation_cases enable row level security;
alter table public.moderation_action_requests enable row level security;
alter table public.evidence_records enable row level security;
alter table public.audit_logs enable row level security;
alter table public.deletion_audit_logs enable row level security;

create policy "members read workspaces"
  on public.workspaces for select
  using (public.is_workspace_member(id));

create policy "members read workspace members"
  on public.workspace_members for select
  using (public.is_workspace_member(workspace_id));

create policy "members read youtube connections"
  on public.youtube_connections for select
  using (public.is_workspace_member(workspace_id));

create policy "members read youtube channel candidates"
  on public.youtube_channel_candidates for select
  using (public.is_workspace_member(workspace_id));

create policy "members read youtube videos"
  on public.youtube_videos for select
  using (public.is_workspace_member(workspace_id));

create policy "members read comment import jobs"
  on public.comment_import_jobs for select
  using (public.is_workspace_member(workspace_id));

create policy "members read raw comments"
  on public.raw_comments for select
  using (public.is_workspace_member(workspace_id));

create policy "members read raw comment payloads"
  on public.raw_comment_payloads for select
  using (public.is_workspace_member(workspace_id));

create policy "members read comment import items"
  on public.comment_import_items for select
  using (public.is_workspace_member(workspace_id));

create policy "members read creator policies"
  on public.creator_policies for select
  using (public.is_workspace_member(workspace_id));

create policy "members read phrase rules"
  on public.phrase_rules for select
  using (public.is_workspace_member(workspace_id));

create policy "members read rule evaluations"
  on public.rule_evaluations for select
  using (public.is_workspace_member(workspace_id));

create policy "members read analysis jobs"
  on public.analysis_jobs for select
  using (public.is_workspace_member(workspace_id));

create policy "members read analysis job items"
  on public.analysis_job_items for select
  using (public.is_workspace_member(workspace_id));

create policy "members read model runs"
  on public.model_runs for select
  using (public.is_workspace_member(workspace_id));

create policy "members read comment analyses"
  on public.comment_analyses for select
  using (public.is_workspace_member(workspace_id));

create policy "members read sanitized feedback"
  on public.sanitized_feedback for select
  using (public.is_workspace_member(workspace_id));

create policy "members read creator feedback"
  on public.creator_feedback for select
  using (public.is_workspace_member(workspace_id));

create policy "members read feedback embeddings"
  on public.feedback_embeddings for select
  using (public.is_workspace_member(workspace_id));

create policy "members read workspace summaries"
  on public.workspace_analysis_summaries for select
  using (public.is_workspace_member(workspace_id));

create policy "members read moderation requests"
  on public.moderation_action_requests for select
  using (public.is_workspace_member(workspace_id));

create policy "members read evidence records"
  on public.evidence_records for select
  using (public.is_workspace_member(workspace_id));

create policy "members read audit logs"
  on public.audit_logs for select
  using (public.is_workspace_member(workspace_id));

revoke all on all tables in schema public from anon, authenticated;

grant select on table
  public.workspaces,
  public.workspace_members,
  public.youtube_channel_candidates,
  public.youtube_videos,
  public.comment_import_jobs,
  public.comment_import_items,
  public.creator_policies,
  public.phrase_rules,
  public.rule_evaluations,
  public.analysis_jobs,
  public.analysis_job_items,
  public.model_runs,
  public.comment_analyses,
  public.sanitized_feedback,
  public.creator_feedback,
  public.feedback_embeddings,
  public.workspace_analysis_summaries,
  public.moderation_action_requests,
  public.audit_logs,
  public.current_comment_analyses,
  public.youtube_connection_overview
to authenticated;

grant select, insert, update, delete
  on all tables in schema public
  to service_role;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.ensure_owner_workspace() from public;
revoke all on function public.match_creator_feedback(
  uuid,
  vector,
  real,
  integer
) from public;
revoke all on function public.get_dashboard_summary(uuid) from public;
revoke all on function public.get_inbox_page(
  uuid,
  public.review_level[],
  public.comment_category,
  text,
  text,
  real,
  real,
  integer,
  integer
) from public;

grant execute on function public.is_workspace_member(uuid)
  to authenticated, service_role;
grant execute on function public.ensure_owner_workspace()
  to authenticated, service_role;
grant execute on function public.match_creator_feedback(
  uuid,
  vector,
  real,
  integer
) to authenticated, service_role;
grant execute on function public.get_dashboard_summary(uuid)
  to authenticated, service_role;
grant execute on function public.get_inbox_page(
  uuid,
  public.review_level[],
  public.comment_category,
  text,
  text,
  real,
  real,
  integer,
  integer
) to authenticated, service_role;
