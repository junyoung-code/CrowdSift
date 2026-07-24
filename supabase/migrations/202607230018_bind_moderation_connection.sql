alter table public.moderation_action_requests
  add column youtube_connection_id uuid
    references public.youtube_connections(id) on delete restrict,
  add column youtube_channel_id text,
  add column connection_updated_at timestamptz;

drop function public.create_moderation_request_with_evidence(
  uuid,
  uuid,
  uuid,
  public.moderation_action,
  public.action_state,
  text,
  jsonb
);

create function public.create_moderation_request_with_evidence(
  target_workspace_id uuid,
  target_raw_comment_id uuid,
  target_requested_by uuid,
  target_action public.moderation_action,
  target_state public.action_state,
  target_idempotency_key text,
  target_evidence jsonb,
  target_connection_id uuid,
  target_channel_id text,
  target_connection_updated_at timestamptz
)
returns table (
  request_id uuid,
  request_state public.action_state
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_request_id uuid;
  created_request_state public.action_state;
begin
  if target_state not in ('pending_confirmation', 'awaiting_scope') then
    raise exception 'invalid initial moderation state' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = target_requested_by
  ) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.raw_comments rc
    where rc.workspace_id = target_workspace_id
      and rc.id = target_raw_comment_id
  ) then
    raise exception 'moderation source not found' using errcode = 'P0002';
  end if;

  if not exists (
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
  ) then
    raise exception 'moderation connection changed' using errcode = '40001';
  end if;

  insert into public.moderation_action_requests (
    workspace_id,
    raw_comment_id,
    requested_by,
    action,
    idempotency_key,
    state,
    youtube_connection_id,
    youtube_channel_id,
    connection_updated_at
  )
  values (
    target_workspace_id,
    target_raw_comment_id,
    target_requested_by,
    target_action,
    target_idempotency_key,
    target_state,
    target_connection_id,
    target_channel_id,
    target_connection_updated_at
  )
  on conflict (idempotency_key) do nothing
  returning id, state into created_request_id, created_request_state;

  if created_request_id is null then
    select mar.id, mar.state
    into created_request_id, created_request_state
    from public.moderation_action_requests mar
    where mar.idempotency_key = target_idempotency_key
      and mar.workspace_id = target_workspace_id
      and mar.raw_comment_id = target_raw_comment_id
      and mar.requested_by = target_requested_by
      and mar.action = target_action
      and mar.youtube_connection_id = target_connection_id
      and mar.youtube_channel_id = target_channel_id
      and mar.connection_updated_at = target_connection_updated_at;

    if created_request_id is null then
      raise exception 'idempotency key belongs to another request'
        using errcode = '23505';
    end if;

    return query
    select created_request_id, created_request_state;
    return;
  end if;

  insert into public.evidence_records (
    workspace_id,
    action_request_id,
    raw_comment_id,
    source_snapshot
  )
  values (
    target_workspace_id,
    created_request_id,
    target_raw_comment_id,
    target_evidence
  );

  return query
  select created_request_id, created_request_state;
end;
$$;

revoke all on function public.create_moderation_request_with_evidence(
  uuid,
  uuid,
  uuid,
  public.moderation_action,
  public.action_state,
  text,
  jsonb,
  uuid,
  text,
  timestamptz
) from public;

grant execute on function public.create_moderation_request_with_evidence(
  uuid,
  uuid,
  uuid,
  public.moderation_action,
  public.action_state,
  text,
  jsonb,
  uuid,
  text,
  timestamptz
) to service_role;
