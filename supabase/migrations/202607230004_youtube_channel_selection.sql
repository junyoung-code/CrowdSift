create unique index youtube_channel_candidates_one_selected_per_workspace
  on public.youtube_channel_candidates(workspace_id)
  where selected;

create or replace function public.select_youtube_channel(
  target_workspace_id uuid,
  target_channel_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_member(target_workspace_id) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;

  update public.youtube_channel_candidates
  set selected = false
  where workspace_id = target_workspace_id
    and selected;

  update public.youtube_channel_candidates
  set selected = true
  where workspace_id = target_workspace_id
    and youtube_channel_id = target_channel_id;

  if not found then
    raise exception 'channel candidate not found' using errcode = 'P0002';
  end if;

  update public.youtube_connections
  set
    status = 'connected',
    updated_at = now()
  where workspace_id = target_workspace_id;
end;
$$;

create or replace function public.disconnect_youtube_channel(
  target_workspace_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_member(target_workspace_id) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;

  update public.youtube_connections
  set
    encrypted_access_token = null,
    encrypted_refresh_token = null,
    token_expires_at = null,
    granted_scopes = '{}',
    status = 'disconnected',
    updated_at = now()
  where workspace_id = target_workspace_id;

  update public.youtube_channel_candidates
  set selected = false
  where workspace_id = target_workspace_id
    and selected;
end;
$$;

revoke all on function public.select_youtube_channel(uuid, text) from public;
revoke all on function public.disconnect_youtube_channel(uuid) from public;

grant execute on function public.select_youtube_channel(uuid, text)
  to authenticated, service_role;
grant execute on function public.disconnect_youtube_channel(uuid)
  to authenticated, service_role;
