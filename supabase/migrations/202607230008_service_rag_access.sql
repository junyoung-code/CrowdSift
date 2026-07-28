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
  if auth.role() <> 'service_role'
    and not public.is_workspace_member(target_workspace_id)
  then
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
