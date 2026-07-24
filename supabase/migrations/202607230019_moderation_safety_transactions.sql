create or replace function public.claim_moderation_request(
  target_workspace_id uuid,
  target_request_id uuid,
  target_actor_user_id uuid,
  target_confirmed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows integer;
begin
  update public.moderation_action_requests mar
  set
    state = 'running',
    confirmed_at = target_confirmed_at
  where mar.id = target_request_id
    and mar.workspace_id = target_workspace_id
    and mar.requested_by = target_actor_user_id
    and mar.state = 'pending_confirmation'
    and exists (
      select 1
      from public.youtube_connections yc
      join public.youtube_channel_candidates ycc
        on ycc.connection_id = yc.id
        and ycc.workspace_id = yc.workspace_id
      where yc.id = mar.youtube_connection_id
        and yc.workspace_id = mar.workspace_id
        and yc.status = 'connected'
        and yc.updated_at = mar.connection_updated_at
        and ycc.youtube_channel_id = mar.youtube_channel_id
        and ycc.selected
    )
    and (
      mar.action <> 'delete'
      or exists (
        select 1
        from public.raw_comments rc
        where rc.id = mar.raw_comment_id
          and rc.workspace_id = mar.workspace_id
          and rc.author_channel_id = mar.youtube_channel_id
          and rc.source_deleted_at is null
      )
    );

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

drop function public.complete_moderation_request(
  uuid,
  uuid,
  public.action_state,
  integer,
  timestamptz,
  text
);

create function public.complete_moderation_request(
  target_workspace_id uuid,
  target_request_id uuid,
  target_actor_user_id uuid,
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
      error_code = target_error_code
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
      'errorCode', target_error_code
    )
  )
  on conflict do nothing;

  return true;
end;
$$;

create function public.resume_moderation_after_scope(
  target_workspace_id uuid,
  target_request_id uuid,
  target_actor_user_id uuid,
  target_connection_id uuid,
  target_channel_id text,
  target_connection_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows integer;
begin
  update public.moderation_action_requests mar
  set
    state = 'pending_confirmation',
    connection_updated_at = target_connection_updated_at
  where mar.id = target_request_id
    and mar.workspace_id = target_workspace_id
    and mar.requested_by = target_actor_user_id
    and mar.state = 'awaiting_scope'
    and mar.youtube_connection_id = target_connection_id
    and mar.youtube_channel_id = target_channel_id
    and exists (
      select 1
      from public.youtube_connections yc
      join public.youtube_channel_candidates ycc
        on ycc.connection_id = yc.id
        and ycc.workspace_id = yc.workspace_id
      where yc.id = target_connection_id
        and yc.workspace_id = target_workspace_id
        and yc.status = 'connected'
        and yc.updated_at = target_connection_updated_at
        and ycc.youtube_channel_id = target_channel_id
        and ycc.selected
    );

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

create function public.reconcile_stale_moderation_request(
  target_workspace_id uuid,
  target_request_id uuid,
  target_actor_user_id uuid,
  target_stale_before timestamptz,
  target_reconciled_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  completed_action public.moderation_action;
begin
  update public.moderation_action_requests mar
  set
    state = 'failed',
    executed_at = target_reconciled_at,
    provider_result = null,
    error_code = 'provider_result_unknown'
  where mar.id = target_request_id
    and mar.workspace_id = target_workspace_id
    and mar.requested_by = target_actor_user_id
    and mar.state = 'running'
    and mar.confirmed_at <= target_stale_before
  returning mar.action into completed_action;

  if completed_action is null then
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
    'moderation_failed',
    'moderation_action_request',
    target_request_id::text,
    jsonb_build_object(
      'action', completed_action,
      'providerStatus', null,
      'errorCode', 'provider_result_unknown'
    )
  )
  on conflict do nothing;

  return true;
end;
$$;

revoke all on function public.complete_moderation_request(
  uuid,
  uuid,
  uuid,
  public.action_state,
  integer,
  timestamptz,
  text
) from public;
revoke all on function public.resume_moderation_after_scope(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  timestamptz
) from public;
revoke all on function public.reconcile_stale_moderation_request(
  uuid,
  uuid,
  uuid,
  timestamptz,
  timestamptz
) from public;

grant execute on function public.complete_moderation_request(
  uuid,
  uuid,
  uuid,
  public.action_state,
  integer,
  timestamptz,
  text
) to service_role;
grant execute on function public.resume_moderation_after_scope(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  timestamptz
) to service_role;
grant execute on function public.reconcile_stale_moderation_request(
  uuid,
  uuid,
  uuid,
  timestamptz,
  timestamptz
) to service_role;
