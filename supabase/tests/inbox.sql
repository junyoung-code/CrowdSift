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

insert into public.comment_import_jobs (
  id,
  workspace_id,
  youtube_video_id,
  requested_top_level_count,
  source_kind,
  requested_total_count,
  source_video_url
)
values (
  '56565656-5656-4565-8565-565656565656',
  '33333333-3333-3333-3333-333333333333',
  'video-inbox',
  null,
  'public_url',
  20,
  'https://www.youtube.com/watch?v=AbCdEfGhI12'
);

insert into public.raw_comments (
  id,
  workspace_id,
  youtube_video_id,
  youtube_comment_id,
  author_channel_id,
  author_display_name,
  author_avatar_url,
  text_display,
  published_at,
  first_import_job_id
)
values
  (
    '66666666-6666-4666-8666-666666666666',
    '33333333-3333-3333-3333-333333333333',
    'video-inbox',
    'comment-pending',
    'creator-channel',
    '분석 대기 작성자',
    null,
    '아직 분석하지 않은 댓글',
    '2026-07-24T00:00:00Z',
    '55555555-5555-5555-5555-555555555555'
  ),
  (
    '77777777-7777-4777-8777-777777777777',
    '33333333-3333-3333-3333-333333333333',
    'video-inbox',
    'comment-safe',
    'safe-author-channel',
    '안전 댓글 작성자',
    'https://example.test/safe-avatar.png',
    '안전 댓글 원문',
    '2026-07-24T00:01:00Z',
    '55555555-5555-5555-5555-555555555555'
  ),
  (
    '88888888-8888-4888-8888-888888888888',
    '33333333-3333-3333-3333-333333333333',
    'video-inbox',
    'comment-caution',
    'caution-author-channel',
    '주의 댓글 작성자',
    'https://example.test/caution-avatar.png',
    '주의 댓글 원문',
    '2026-07-24T00:02:00Z',
    '55555555-5555-5555-5555-555555555555'
  ),
  (
    '99999999-9999-4999-8999-999999999999',
    '33333333-3333-3333-3333-333333333333',
    'video-inbox',
    'comment-risk',
    'risk-author-channel',
    '위험 댓글 작성자',
    null,
    '위험 댓글 원문',
    '2026-07-24T00:03:00Z',
    '55555555-5555-5555-5555-555555555555'
  );

insert into public.comment_import_items (
  import_job_id,
  workspace_id,
  youtube_comment_id,
  raw_comment_id,
  status
)
values
  (
    '55555555-5555-5555-5555-555555555555',
    '33333333-3333-3333-3333-333333333333',
    'comment-pending',
    '66666666-6666-4666-8666-666666666666',
    'succeeded'
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    '33333333-3333-3333-3333-333333333333',
    'comment-safe',
    '77777777-7777-4777-8777-777777777777',
    'succeeded'
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    '33333333-3333-3333-3333-333333333333',
    'comment-caution',
    '88888888-8888-4888-8888-888888888888',
    'succeeded'
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    '33333333-3333-3333-3333-333333333333',
    'comment-risk',
    '99999999-9999-4999-8999-999999999999',
    'succeeded'
  ),
  (
    '56565656-5656-4565-8565-565656565656',
    '33333333-3333-3333-3333-333333333333',
    'comment-safe',
    '77777777-7777-4777-8777-777777777777',
    'succeeded'
  );

insert into public.model_runs (
  id,
  workspace_id,
  raw_comment_id,
  stage,
  provider,
  model_identifier,
  idempotency_key,
  prompt_version,
  schema_version,
  policy_version,
  status
)
values
  (
    '17777777-7777-4777-8777-777777777777',
    '33333333-3333-3333-3333-333333333333',
    '77777777-7777-4777-8777-777777777777',
    1,
    'fixture',
    'fixture-model',
    'inbox-safe-model-run',
    'fixture-v1',
    'fixture-v1',
    1,
    'succeeded'
  ),
  (
    '18888888-8888-4888-8888-888888888888',
    '33333333-3333-3333-3333-333333333333',
    '88888888-8888-4888-8888-888888888888',
    1,
    'fixture',
    'fixture-model',
    'inbox-caution-model-run',
    'fixture-v1',
    'fixture-v1',
    1,
    'succeeded'
  ),
  (
    '19999999-9999-4999-8999-999999999999',
    '33333333-3333-3333-3333-333333333333',
    '99999999-9999-4999-8999-999999999999',
    1,
    'fixture',
    'fixture-model',
    'inbox-risk-model-run',
    'fixture-v1',
    'fixture-v1',
    1,
    'succeeded'
  );

insert into public.comment_analyses (
  id,
  workspace_id,
  raw_comment_id,
  model_run_id,
  stage,
  category,
  confidence,
  review_level,
  toxicity,
  spam,
  phishing,
  actionable_feedback,
  recommended_action,
  manual_review,
  evidence_review,
  explanation,
  policy_version,
  provenance
)
values
  (
    '27777777-7777-4777-8777-777777777777',
    '33333333-3333-3333-3333-333333333333',
    '77777777-7777-4777-8777-777777777777',
    '17777777-7777-4777-8777-777777777777',
    1,
    'positive',
    0.98,
    'safe',
    0.01,
    0.01,
    0.01,
    false,
    'none',
    false,
    false,
    '안전 댓글 테스트 분석',
    1,
    '{}'
  ),
  (
    '28888888-8888-4888-8888-888888888888',
    '33333333-3333-3333-3333-333333333333',
    '88888888-8888-4888-8888-888888888888',
    '18888888-8888-4888-8888-888888888888',
    1,
    'toxic_but_actionable',
    0.82,
    'caution',
    0.62,
    0.01,
    0.01,
    true,
    'review',
    true,
    false,
    '주의 댓글 테스트 분석',
    1,
    '{}'
  ),
  (
    '29999999-9999-4999-8999-999999999999',
    '33333333-3333-3333-3333-333333333333',
    '99999999-9999-4999-8999-999999999999',
    '19999999-9999-4999-8999-999999999999',
    1,
    'harassment',
    0.95,
    'risk',
    0.96,
    0.01,
    0.01,
    false,
    'reject',
    true,
    true,
    '위험 댓글 테스트 분석',
    1,
    '{}'
  );

insert into public.sanitized_feedback (
  workspace_id,
  analysis_id,
  neutral_text,
  normalized_question,
  no_signal
)
values
  (
    '33333333-3333-3333-3333-333333333333',
    '27777777-7777-4777-8777-777777777777',
    '안전 댓글 요약',
    null,
    false
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '28888888-8888-4888-8888-888888888888',
    '주의 댓글 순화 요약',
    null,
    false
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '29999999-9999-4999-8999-999999999999',
    '위험 댓글 순화 요약',
    null,
    false
  );

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
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'authenticated',
  'authenticated',
  'foreign-owner@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.workspaces (id, owner_user_id, name)
values (
  '44444444-4444-4444-8444-444444444444',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'Foreign inbox workspace'
);

select plan(9);

set local role anon;

select throws_ok(
  $$
    select *
    from public.get_acknowledged_comment_source(
      '33333333-3333-3333-3333-333333333333',
      '88888888-8888-4888-8888-888888888888'
    )
  $$,
  '42501',
  null,
  'anonymous users cannot request comment source'
);

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
    select array_agg(source_import_job_id order by source_import_job_id)
    from public.get_inbox_page(
      target_workspace_id =>
        '33333333-3333-3333-3333-333333333333',
      review_levels => array['safe']::public.review_level[]
    )
    where raw_comment_id = '77777777-7777-4777-8777-777777777777'
  ),
  array['55555555-5555-5555-5555-555555555555'::uuid],
  'Inbox shows one row per raw comment and prefers its owned OAuth observation'
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

select is(
  (
    select safe_source_text
    from public.get_inbox_page(
      target_workspace_id =>
        '33333333-3333-3333-3333-333333333333',
      review_levels => array['safe']::public.review_level[]
    )
    where raw_comment_id = '77777777-7777-4777-8777-777777777777'
  ),
  '안전 댓글 원문',
  'safe source is returned in the inbox read model'
);

select is(
  (
    select safe_source_text
    from public.get_inbox_page(
      target_workspace_id =>
        '33333333-3333-3333-3333-333333333333',
      review_levels => array['caution']::public.review_level[]
    )
    where raw_comment_id = '88888888-8888-4888-8888-888888888888'
  ),
  null,
  'caution source is omitted from the inbox read model'
);

select lives_ok(
  $$
    select *
    from public.get_acknowledged_comment_source(
      '33333333-3333-3333-3333-333333333333',
      '88888888-8888-4888-8888-888888888888'
    )
  $$,
  'workspace member can request acknowledged source'
);

select throws_ok(
  $$
    select *
    from public.get_acknowledged_comment_source(
      '44444444-4444-4444-8444-444444444444',
      '88888888-8888-4888-8888-888888888888'
    )
  $$,
  '42501',
  'workspace access denied',
  'other workspace source is denied'
);

select throws_ok(
  $$ select text_display from public.raw_comments limit 1 $$,
  '42501',
  null,
  'authenticated users still cannot select raw_comments directly'
);

select * from finish();

rollback;
