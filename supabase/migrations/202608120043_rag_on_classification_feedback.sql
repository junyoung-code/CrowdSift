-- 개인화 검색이 지금 파이프라인의 교정을 보게 한다.
--
-- `feedback_embeddings` 와 `match_creator_feedback` 은 `creator_feedback` 을 읽는데,
-- 그 테이블은 `analysis_id` 가 NOT NULL 이고 `comment_analyses` 를 가리킨다. 지금
-- 파이프라인은 `comment_analyses` 에 아무것도 쓰지 않으므로 **행을 만들 수가 없다.**
-- 취향 문제가 아니라 구조적으로 닿지 않는 것이다.
--
-- 그래서 옛 길을 지우지 않고 옆에 길을 하나 낸다. `creator_feedback` 쪽 경로는 그대로
-- 두고, 임베딩 한 줄이 둘 중 **정확히 하나**를 가리키게 한다. 나중에 옛 파이프라인을
-- 걷어낼 때 이 열만 지우면 된다.

alter table public.feedback_embeddings
  alter column creator_feedback_id drop not null;

alter table public.feedback_embeddings
  add column if not exists classification_feedback_id uuid
    unique
    references public.classification_feedback(id) on delete cascade;

-- 둘 다 비어 있으면 무엇의 임베딩인지 알 수 없고, 둘 다 차 있으면 어느 쪽 교정이
-- 이 벡터의 주인인지 알 수 없다.
alter table public.feedback_embeddings
  drop constraint if exists feedback_embeddings_exactly_one_owner;

alter table public.feedback_embeddings
  add constraint feedback_embeddings_exactly_one_owner
    check (num_nonnulls(creator_feedback_id, classification_feedback_id) = 1);

create index if not exists feedback_embeddings_classification_feedback_idx
  on public.feedback_embeddings (classification_feedback_id)
  where deleted_at is null;

/**
 * 이 워크스페이스에서 이미 사람이 정한 판단 중 비슷한 것을 찾는다.
 *
 * `match_creator_feedback` 과 같은 자리를 하지만 돌려주는 것이 하나 더 많다.
 * **어떤 댓글이 그 판정을 받았는지**다. 그것이 없으면 모델에게 「등급 safe」 라는
 * 꼬리표만 건네는 셈이라 사례 구실을 못 한다.
 *
 * 등급은 사람이 고친 값을 먼저 쓰고, 고치지 않고 승인만 했으면 그때 확정된 값을 쓴다.
 * 어느 쪽이든 **사람이 그 등급에 동의했다**는 뜻이다.
 *
 * 게이트는 그대로다. 워크스페이스가 다르면 막고, 크리에이터가 개인화에 쓰겠다고 한
 * 것만 보고, 최대 다섯 건까지만 낸다.
 */
drop function if exists public.match_classification_feedback(
  uuid, vector(1536), real, integer
);

create function public.match_classification_feedback(
  target_workspace_id uuid,
  query_embedding vector(1536),
  match_threshold real default 0.78,
  match_count integer default 5
)
returns table (
  feedback_id uuid,
  similarity real,
  decision text,
  source_text text,
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
    rc.text_display,
    cf.corrected_category,
    coalesce(cf.corrected_level, cv.level),
    cf.edited_feedback_core
  from public.feedback_embeddings fe
  join public.classification_feedback cf
    on cf.id = fe.classification_feedback_id
  join public.raw_comments rc
    on rc.id = cf.raw_comment_id
  join public.classification_verdicts cv
    on cv.id = cf.classification_verdict_id
  where fe.workspace_id = target_workspace_id
    and cf.workspace_id = target_workspace_id
    and cf.use_for_personalization
    and fe.deleted_at is null
    -- 등급이 없는 사례는 가르쳐 줄 것이 없다. 사람이 보류로 넘긴 것이 그렇다.
    and coalesce(cf.corrected_level, cv.level) is not null
    and (1 - (fe.embedding <=> query_embedding)) >= match_threshold
  order by fe.embedding <=> query_embedding
  limit least(greatest(match_count, 0), 5);
end;
$$;
