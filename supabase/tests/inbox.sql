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
  'inbox-owner@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.workspaces (id, owner_user_id, name)
values (
  '33333333-3333-3333-3333-333333333333',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'Inbox workspace'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  '33333333-3333-3333-3333-333333333333',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'owner'
);

insert into public.youtube_connections (
  id,
  workspace_id,
  status
)
values (
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  'connected'
);

insert into public.youtube_channel_candidates (
  connection_id,
  workspace_id,
  youtube_channel_id,
  title,
  selected
)
values (
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  'creator-channel',
  'Creator channel',
  true
);

insert into public.comment_import_jobs (
  id,
  workspace_id,
  youtube_video_id,
  requested_top_level_count
)
values (
  '55555555-5555-5555-5555-555555555555',
  '33333333-3333-3333-3333-333333333333',
  'video-inbox',
  20
);

insert into public.raw_comments (
  id,
  workspace_id,
  youtube_video_id,
  youtube_comment_id,
  author_channel_id,
  text_display,
  first_import_job_id
)
values (
  '66666666-6666-6666-6666-666666666666',
  '33333333-3333-3333-3333-333333333333',
  'video-inbox',
  'comment-pending',
  'creator-channel',
  '아직 분석하지 않은 댓글',
  '55555555-5555-5555-5555-555555555555'
);

insert into public.comment_import_items (
  import_job_id,
  workspace_id,
  youtube_comment_id,
  raw_comment_id,
  status
)
values (
  '55555555-5555-5555-5555-555555555555',
  '33333333-3333-3333-3333-333333333333',
  'comment-pending',
  '66666666-6666-6666-6666-666666666666',
  'succeeded'
);

select plan(2);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  true
);
select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);

select is(
  (
    select count(*)::integer
    from public.get_inbox_page(
      target_workspace_id =>
        '33333333-3333-3333-3333-333333333333',
      analysis_state_filter => 'pending'
    )
  ),
  1,
  'Inbox can explicitly show pending comments without exposing source text'
);

select ok(
  (
    select delete_eligible
    from public.get_inbox_page(
      target_workspace_id =>
        '33333333-3333-3333-3333-333333333333',
      analysis_state_filter => 'pending'
    )
    limit 1
  ),
  'permanent delete is exposed only when the connected channel wrote the comment'
);

select * from finish();

rollback;
