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
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'authenticated',
  'authenticated',
  'dashboard-owner@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.workspaces (id, owner_user_id, name)
values (
  '44444444-4444-4444-4444-444444444444',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Dashboard workspace'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  '44444444-4444-4444-4444-444444444444',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'owner'
);

insert into public.youtube_connections (
  id,
  workspace_id,
  status
)
values (
  '11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-4444-444444444444',
  'revoked'
);

insert into public.youtube_channel_candidates (
  connection_id,
  workspace_id,
  youtube_channel_id,
  title,
  selected
)
values (
  '11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-4444-444444444444',
  'revoked-channel',
  'Revoked channel',
  true
);

insert into public.youtube_videos (
  workspace_id,
  youtube_channel_id,
  youtube_video_id,
  title,
  captured_at
)
values
  (
    '44444444-4444-4444-4444-444444444444',
    'revoked-channel',
    'latest-import-video',
    'Latest imported video',
    '2026-07-20T00:00:00Z'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'revoked-channel',
    'newest-captured-video',
    'Newest captured video',
    '2026-07-24T00:00:00Z'
  );

insert into public.comment_import_jobs (
  id,
  workspace_id,
  youtube_video_id,
  requested_top_level_count,
  status,
  created_at
)
values
  (
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-4444-444444444444',
    'newest-captured-video',
    20,
    'succeeded',
    '2026-07-21T00:00:00Z'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    'latest-import-video',
    20,
    'succeeded',
    '2026-07-23T00:00:00Z'
  );

select plan(6);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  true
);
select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);

select ok(
  (
    select to_jsonb(summary) ?& array[
      'priority_comments',
      'recent_corrections',
      'recent_actions'
    ]
    from public.get_dashboard_summary(
      '44444444-4444-4444-4444-444444444444'
    ) summary
  ),
  'dashboard read model includes priority comments, corrections, and actions'
);

select is(
  (
    select jsonb_array_length(to_jsonb(summary) -> 'priority_comments')
    from public.get_dashboard_summary(
      '44444444-4444-4444-4444-444444444444'
    ) summary
  ),
  0,
  'dashboard read model returns an empty priority list without fake data'
);

select has_function(
  'public',
  'get_dashboard_summary_inputs',
  array['uuid'],
  'service-only dashboard summary inputs are available after analysis'
);

select ok(
  (
    select summary.selected_channel is null
    from public.get_dashboard_summary(
      '44444444-4444-4444-4444-444444444444'
    ) summary
  ),
  'a revoked connection does not appear as a connected dashboard channel'
);

select is(
  (
    select summary.latest_video ->> 'youtubeVideoId'
    from public.get_dashboard_summary(
      '44444444-4444-4444-4444-444444444444'
    ) summary
  ),
  'latest-import-video',
  'latest video follows the latest import job instead of capture time'
);

select is(
  (
    select summary.latest_import_job ->> 'id'
    from public.get_dashboard_summary(
      '44444444-4444-4444-4444-444444444444'
    ) summary
  ),
  '33333333-3333-4333-8333-333333333333',
  'latest import job and latest video stay aligned'
);

select * from finish();

rollback;
