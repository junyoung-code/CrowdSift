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
  'abababab-abab-abab-abab-abababababab',
  'authenticated',
  'authenticated',
  'analysis-owner@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.workspaces (id, owner_user_id, name)
values (
  'aaaaaaaa-1111-1111-1111-111111111111',
  'abababab-abab-abab-abab-abababababab',
  'Analysis workspace'
);

insert into public.comment_import_jobs (
  id,
  workspace_id,
  youtube_video_id,
  requested_top_level_count,
  status
)
values (
  'aaaaaaaa-2222-2222-2222-222222222222',
  'aaaaaaaa-1111-1111-1111-111111111111',
  'video-analysis',
  20,
  'succeeded'
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
  'aaaaaaaa-3333-3333-3333-333333333333',
  'aaaaaaaa-1111-1111-1111-111111111111',
  'video-analysis',
  'comment-analysis',
  '분석할 댓글',
  'aaaaaaaa-2222-2222-2222-222222222222'
);

insert into public.analysis_jobs (
  id,
  workspace_id,
  import_job_id,
  configuration_key,
  total_count
)
values (
  'aaaaaaaa-4444-4444-4444-444444444444',
  'aaaaaaaa-1111-1111-1111-111111111111',
  'aaaaaaaa-2222-2222-2222-222222222222',
  'analysis-config',
  1
);

insert into public.analysis_job_items (
  id,
  analysis_job_id,
  workspace_id,
  raw_comment_id
)
values (
  'aaaaaaaa-5555-5555-5555-555555555555',
  'aaaaaaaa-4444-4444-4444-444444444444',
  'aaaaaaaa-1111-1111-1111-111111111111',
  'aaaaaaaa-3333-3333-3333-333333333333'
);

select plan(3);

select results_eq(
  $$
    select item_id
    from public.claim_analysis_job_items(
      'aaaaaaaa-4444-4444-4444-444444444444',
      5
    )
  $$,
  $$ values ('aaaaaaaa-5555-5555-5555-555555555555'::uuid) $$,
  'a pending analysis item is claimed'
);

select results_eq(
  $$
    select status, attempt_count
    from public.analysis_job_items
    where id = 'aaaaaaaa-5555-5555-5555-555555555555'
  $$,
  $$ values ('running'::public.item_status, 1) $$,
  'claiming marks the item running and increments its attempt'
);

select is_empty(
  $$
    select item_id
    from public.claim_analysis_job_items(
      'aaaaaaaa-4444-4444-4444-444444444444',
      5
    )
  $$,
  'the same running item cannot be claimed twice'
);

select * from finish();

rollback;
