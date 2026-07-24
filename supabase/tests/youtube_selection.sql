begin;

create extension if not exists pgtap with schema extensions;

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'authenticated',
  'authenticated',
  'youtube-owner@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.workspaces (id, owner_user_id, name)
values (
  '55555555-5555-5555-5555-555555555555',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'YouTube workspace'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  '55555555-5555-5555-5555-555555555555',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'owner'
);

insert into public.youtube_connections (
  id,
  workspace_id,
  status,
  encrypted_access_token
)
values (
  '66666666-6666-6666-6666-666666666666',
  '55555555-5555-5555-5555-555555555555',
  'pending_channel_selection',
  'sealed-access-token'
);

insert into public.youtube_channel_candidates (
  connection_id,
  workspace_id,
  youtube_channel_id,
  title,
  selected
)
values
  (
    '66666666-6666-6666-6666-666666666666',
    '55555555-5555-5555-5555-555555555555',
    'channel-a',
    'Channel A',
    true
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    '55555555-5555-5555-5555-555555555555',
    'channel-b',
    'Channel B',
    false
  );

select plan(4);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    select public.select_youtube_channel(
      '55555555-5555-5555-5555-555555555555',
      'channel-b'
    )
  $$,
  'a member can select one owned YouTube channel'
);

select results_eq(
  $$
    select youtube_channel_id
    from public.youtube_channel_candidates
    where workspace_id = '55555555-5555-5555-5555-555555555555'
      and selected
  $$,
  $$ values ('channel-b'::text) $$,
  'the older selection is cleared atomically'
);

select lives_ok(
  $$
    select id, status, granted_scopes, updated_at
    from public.youtube_connection_overview
    where workspace_id = '55555555-5555-5555-5555-555555555555'
  $$,
  'a member can read the safe YouTube connection overview'
);

select is(
  has_column_privilege(
    'authenticated',
    'public.youtube_connections',
    'encrypted_access_token',
    'select'
  ),
  false,
  'authenticated users cannot select encrypted YouTube tokens'
);

select * from finish();

rollback;
