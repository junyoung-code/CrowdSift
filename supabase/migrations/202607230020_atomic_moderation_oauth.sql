drop function public.resume_moderation_after_scope(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  timestamptz
);

create function public.complete_moderation_scope_grant(
  target_workspace_id uuid,
  target_request_id uuid,
  target_actor_user_id uuid,
  target_connection_id uuid,
  target_channel_id text,
  target_expected_updated_at timestamptz,
  target_new_updated_at timestamptz,
  target_encrypted_access_token text,
  target_encrypted_refresh_token text,
  target_token_expires_at timestamptz,
  target_granted_scopes text[],
  target_google_subject text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  connection_found boolean;
  request_found boolean;
begin
  if not (
    target_granted_scopes
    @> array['https://www.googleapis.com/auth/youtube.force-ssl']::text[]
  ) then
    return false;
  end if;

  select true
  into connection_found
  from public.youtube_connections yc
  where yc.id = target_connection_id
    and yc.workspace_id = target_workspace_id
    and yc.status = 'connected'
    and yc.updated_at = target_expected_updated_at
  for update;

  if not coalesce(connection_found, false) then
    return false;
  end if;

  if not exists (
    select 1
    from public.youtube_channel_candidates ycc
    where ycc.connection_id = target_connection_id
      and ycc.workspace_id = target_workspace_id
      and ycc.youtube_channel_id = target_channel_id
      and ycc.selected
  ) then
    return false;
  end if;

  select true
  into request_found
  from public.moderation_action_requests mar
  where mar.id = target_request_id
    and mar.workspace_id = target_workspace_id
    and mar.requested_by = target_actor_user_id
    and mar.state = 'awaiting_scope'
    and mar.youtube_connection_id = target_connection_id
    and mar.youtube_channel_id = target_channel_id
    and mar.connection_updated_at = target_expected_updated_at
  for update;

  if not coalesce(request_found, false) then
    return false;
  end if;

  update public.youtube_connections
  set
    encrypted_access_token = target_encrypted_access_token,
    encrypted_refresh_token = target_encrypted_refresh_token,
    token_expires_at = target_token_expires_at,
    granted_scopes = target_granted_scopes,
    google_subject = target_google_subject,
    updated_at = target_new_updated_at
  where id = target_connection_id;

  update public.moderation_action_requests
  set
    state = 'pending_confirmation',
    connection_updated_at = target_new_updated_at
  where id = target_request_id;

  return true;
end;
$$;

revoke all on function public.complete_moderation_scope_grant(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  timestamptz,
  timestamptz,
  text,
  text,
  timestamptz,
  text[],
  text
) from public;

grant execute on function public.complete_moderation_scope_grant(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  timestamptz,
  timestamptz,
  text,
  text,
  timestamptz,
  text[],
  text
) to service_role;
