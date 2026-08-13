-- 실제 조치가 쓴 YouTube 할당량을 센다.
--
-- 읽기는 이미 `comment_import_jobs.youtube_quota_units_used` 에 쌓이는데 쓰기는 아무
-- 데도 남지 않았다. 둘의 값이 오십 배 차이라 쓰기를 세지 않으면 하루치가 언제 끊길지
-- 알 수 없다.
--
--   댓글 50개 가져오기   2~3 유닛
--   악플 하나 숨기기      50 유닛      하루 기본 한도 10,000 → 200 건
--
-- 값은 구글 문서의 고정값이고 응답에 실려 오지 않는다. 부르는 쪽이 적어 보낸다.

alter table public.moderation_action_requests
  add column if not exists youtube_quota_units_used integer not null default 0;

-- 인자를 하나 더한다. 기본값을 주면 기존 7인자 호출과 겹쳐 모호해지므로 필수로 두고,
-- 옛 시그니처는 지운다. 부르는 곳은 한 군데다.
drop function if exists public.complete_moderation_request(
  uuid, uuid, uuid, public.action_state, integer, timestamptz, text
);

CREATE OR REPLACE FUNCTION public.complete_moderation_request(target_workspace_id uuid, target_request_id uuid, target_actor_user_id uuid, target_state action_state, target_provider_status integer, target_executed_at timestamp with time zone, target_error_code text, target_quota_units integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  completed_action public.moderation_action;
  completed_raw_comment_id uuid;
  current_state public.action_state;
begin
  if target_state not in ('succeeded', 'failed') then
    raise exception 'invalid final moderation state' using errcode = '22023';
  end if;

  select mar.action, mar.raw_comment_id, mar.state
  into completed_action, completed_raw_comment_id, current_state
  from public.moderation_action_requests mar
  where mar.id = target_request_id
    and mar.workspace_id = target_workspace_id
    and mar.requested_by = target_actor_user_id
  for update;

  if completed_raw_comment_id is null then
    return false;
  end if;

  if current_state = 'running' then
    update public.moderation_action_requests mar
    set
      state = target_state,
      executed_at = target_executed_at,
      provider_result = case
        when target_provider_status is null then null
        else jsonb_build_object('status', target_provider_status)
      end,
      error_code = target_error_code,
      youtube_quota_units_used = target_quota_units
    where mar.id = target_request_id;

    if completed_action = 'delete' and target_state = 'succeeded' then
      update public.raw_comments rc
      set source_deleted_at = target_executed_at
      where rc.id = completed_raw_comment_id
        and rc.workspace_id = target_workspace_id
        and rc.source_deleted_at is null;
    end if;
  elsif current_state <> target_state then
    return false;
  end if;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    event_type,
    target_type,
    target_id,
    metadata
  )
  values (
    target_workspace_id,
    target_actor_user_id,
    case
      when target_state = 'succeeded'
        then 'moderation_succeeded'
      else 'moderation_failed'
    end,
    'moderation_action_request',
    target_request_id::text,
    jsonb_build_object(
      'action', completed_action,
      'providerStatus', target_provider_status,
      'errorCode', target_error_code,
      'quotaUnits', target_quota_units
    )
  )
  on conflict do nothing;

  return true;
end;
$function$

;
