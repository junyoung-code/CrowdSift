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
  'import-owner@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.workspaces (id, owner_user_id, name)
values (
  '77777777-7777-7777-7777-777777777777',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Import workspace'
);

insert into public.youtube_videos (
  workspace_id,
  youtube_channel_id,
  youtube_video_id,
  title
)
values (
  '77777777-7777-7777-7777-777777777777',
  'channel-import',
  'video-import',
  'Import test video'
);

insert into public.comment_import_jobs (
  id,
  workspace_id,
  youtube_video_id,
  requested_top_level_count
)
values (
  '88888888-8888-8888-8888-888888888888',
  '77777777-7777-7777-7777-777777777777',
  'video-import',
  20
);

select plan(4);

select results_eq(
  $$
    select disposition
    from public.store_import_comment_item(
      '88888888-8888-8888-8888-888888888888',
      '77777777-7777-7777-7777-777777777777',
      'video-import',
      'comment-1',
      null,
      'author-1',
      'Author One',
      null,
      'first immutable text',
      'first immutable text',
      3,
      'published',
      '2026-07-23T00:00:00Z',
      '2026-07-23T00:00:00Z',
      '{"version":"first"}'::jsonb
    )
  $$,
  $$ values ('stored'::text) $$,
  'a new YouTube comment is stored'
);

select results_eq(
  $$
    select disposition
    from public.store_import_comment_item(
      '88888888-8888-8888-8888-888888888888',
      '77777777-7777-7777-7777-777777777777',
      'video-import',
      'comment-1',
      null,
      'author-2',
      'Changed Author',
      null,
      'changed text must not overwrite',
      'changed text must not overwrite',
      99,
      'heldForReview',
      '2026-07-24T00:00:00Z',
      '2026-07-24T00:00:00Z',
      '{"version":"changed"}'::jsonb
    )
  $$,
  $$ values ('duplicate'::text) $$,
  'the same YouTube comment is reported as a duplicate'
);

select results_eq(
  $$
    select text_display
    from public.raw_comments
    where workspace_id = '77777777-7777-7777-7777-777777777777'
      and youtube_comment_id = 'comment-1'
  $$,
  $$ values ('first immutable text'::text) $$,
  'a duplicate import never overwrites the preserved source text'
);

select results_eq(
  $$
    select payload ->> 'version'
    from public.raw_comment_payloads rcp
    join public.raw_comments rc on rc.id = rcp.raw_comment_id
    where rc.workspace_id = '77777777-7777-7777-7777-777777777777'
      and rc.youtube_comment_id = 'comment-1'
  $$,
  $$ values ('first'::text) $$,
  'a duplicate import never overwrites the original provider payload'
);

select * from finish();

rollback;
