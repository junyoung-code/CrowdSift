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
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'authenticated',
    'authenticated',
    'owner-one@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'authenticated',
    'authenticated',
    'owner-two@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

insert into public.workspaces (id, owner_user_id, name)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '첫 번째 workspace'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '두 번째 workspace'
  );

insert into public.workspace_members (workspace_id, user_id, role)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'owner'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'owner'
  );

insert into public.comment_import_jobs (
  id,
  workspace_id,
  youtube_video_id,
  requested_top_level_count
)
values (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'video-one',
  20
);

insert into public.raw_comments (
  id,
  workspace_id,
  youtube_video_id,
  youtube_comment_id,
  text_display,
  first_import_job_id
)
values (
  '44444444-4444-4444-4444-444444444444',
  '11111111-1111-1111-1111-111111111111',
  'video-one',
  'comment-one',
  '보존되어야 하는 원문',
  '33333333-3333-3333-3333-333333333333'
);

select plan(4);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  true
);
select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);

select lives_ok(
  $$
    select *
    from public.get_dashboard_summary(
      '11111111-1111-1111-1111-111111111111'
    )
  $$,
  'member can read own workspace'
);

select throws_ok(
  $$
    select *
    from public.get_dashboard_summary(
      '22222222-2222-2222-2222-222222222222'
    )
  $$,
  '42501',
  'workspace access denied',
  'member cannot read another workspace'
);

select throws_ok(
  $$
    update public.raw_comments
    set text_display = 'changed'
    where id = '44444444-4444-4444-4444-444444444444'
  $$,
  '42501',
  null,
  'raw source cannot be updated by user'
);

select is(
  (
    select count(*)::integer
    from public.match_creator_feedback(
      '11111111-1111-1111-1111-111111111111',
      array_fill(0::real, array[1536])::vector,
      0.78,
      5
    )
  ),
  0,
  'RAG never crosses workspace boundary'
);

select * from finish();

rollback;
