grant select (
  id,
  workspace_id,
  status,
  granted_scopes,
  token_expires_at,
  created_at,
  updated_at
)
on public.youtube_connections
to authenticated;
