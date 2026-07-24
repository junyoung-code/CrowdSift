create or replace function public.complete_moderation_request(
  target_workspace_id uuid,
  target_request_id uuid,
  target_state public.action_state,
  target_provider_status integer,
  target_executed_at timestamptz,
  target_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  completed_action public.moderation_action;
  completed_raw_comment_id uuid;
begin
  if target_state not in ('succeeded', 'failed') then
    raise exception 'invalid final moderation state' using errcode = '22023';
  end if;

  update public.moderation_action_requests mar
  set
    state = target_state,
    executed_at = target_executed_at,
    provider_result = case
      when target_provider_status is null then null
      else jsonb_build_object('status', target_provider_status)
    end,
    error_code = target_error_code
  where mar.id = target_request_id
    and mar.workspace_id = target_workspace_id
    and mar.state = 'running'
  returning mar.action, mar.raw_comment_id
  into completed_action, completed_raw_comment_id;

  if completed_raw_comment_id is null then
    return false;
  end if;

  if completed_action = 'delete' and target_state = 'succeeded' then
    update public.raw_comments rc
    set source_deleted_at = target_executed_at
    where rc.id = completed_raw_comment_id
      and rc.workspace_id = target_workspace_id
      and rc.source_deleted_at is null;
  end if;

  return true;
end;
$$;

revoke all on function public.complete_moderation_request(
  uuid,
  uuid,
  public.action_state,
  integer,
  timestamptz,
  text
) from public;

grant execute on function public.complete_moderation_request(
  uuid,
  uuid,
  public.action_state,
  integer,
  timestamptz,
  text
) to service_role;
