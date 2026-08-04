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
  'a0300000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'conversation-owner@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.workspaces (id, owner_user_id, name)
values (
  'a0300000-0000-4000-8000-000000000002',
  'a0300000-0000-4000-8000-000000000001',
  'Conversation workspace'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  'a0300000-0000-4000-8000-000000000002',
  'a0300000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.youtube_videos (
  workspace_id,
  youtube_channel_id,
  youtube_video_id,
  title,
  thumbnail_url,
  published_at
)
values (
  'a0300000-0000-4000-8000-000000000002',
  'channel-conversation',
  'video-conversation',
  '등산 필수 장비 7가지',
  'https://i.ytimg.com/conversation.jpg',
  '2026-07-25T00:00:00Z'
);

insert into public.comment_import_jobs (
  id,
  workspace_id,
  youtube_video_id,
  requested_top_level_count
)
values (
  'a0300000-0000-4000-8000-000000000003',
  'a0300000-0000-4000-8000-000000000002',
  'video-conversation',
  20
);

insert into public.raw_comments (
  id,
  workspace_id,
  youtube_video_id,
  youtube_comment_id,
  parent_youtube_comment_id,
  author_display_name,
  text_display,
  like_count,
  published_at,
  first_import_job_id
)
values
  (
    'a0300000-0000-4000-8000-000000000004',
    'a0300000-0000-4000-8000-000000000002',
    'video-conversation',
    'parent-conversation',
    null,
    'hike_with_me',
    '3:20 구간 설명이 이해가 안 돼요.',
    12,
    '2026-07-28T10:00:00Z',
    'a0300000-0000-4000-8000-000000000003'
  ),
  (
    'a0300000-0000-4000-8000-000000000005',
    'a0300000-0000-4000-8000-000000000002',
    'video-conversation',
    'reply-safe',
    'parent-conversation',
    'creator_hj',
    '좋은 지적 감사합니다.',
    5,
    '2026-07-28T10:10:00Z',
    'a0300000-0000-4000-8000-000000000003'
  ),
  (
    'a0300000-0000-4000-8000-000000000006',
    'a0300000-0000-4000-8000-000000000002',
    'video-conversation',
    'reply-caution',
    'parent-conversation',
    'climb_diary',
    '주의 답글 원문',
    3,
    '2026-07-28T10:20:00Z',
    'a0300000-0000-4000-8000-000000000003'
  ),
  (
    'a0300000-0000-4000-8000-000000000013',
    'a0300000-0000-4000-8000-000000000002',
    'video-conversation',
    'reply-risk',
    'parent-conversation',
    'blocked_viewer',
    '위험 답글 원문',
    1,
    '2026-07-28T10:30:00Z',
    'a0300000-0000-4000-8000-000000000003'
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
    'a0300000-0000-4000-8000-000000000003',
    'a0300000-0000-4000-8000-000000000002',
    'parent-conversation',
    'a0300000-0000-4000-8000-000000000004',
    'succeeded'
  ),
  (
    'a0300000-0000-4000-8000-000000000003',
    'a0300000-0000-4000-8000-000000000002',
    'reply-safe',
    'a0300000-0000-4000-8000-000000000005',
    'succeeded'
  ),
  (
    'a0300000-0000-4000-8000-000000000003',
    'a0300000-0000-4000-8000-000000000002',
    'reply-caution',
    'a0300000-0000-4000-8000-000000000006',
    'succeeded'
  ),
  (
    'a0300000-0000-4000-8000-000000000003',
    'a0300000-0000-4000-8000-000000000002',
    'reply-risk',
    'a0300000-0000-4000-8000-000000000013',
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
    'a0300000-0000-4000-8000-000000000007',
    'a0300000-0000-4000-8000-000000000002',
    'a0300000-0000-4000-8000-000000000004',
    1,
    'fixture',
    'fixture-model',
    'conversation-parent-run',
    'fixture-v1',
    'fixture-v1',
    1,
    'succeeded'
  ),
  (
    'a0300000-0000-4000-8000-000000000008',
    'a0300000-0000-4000-8000-000000000002',
    'a0300000-0000-4000-8000-000000000005',
    1,
    'fixture',
    'fixture-model',
    'conversation-safe-reply-run',
    'fixture-v1',
    'fixture-v1',
    1,
    'succeeded'
  ),
  (
    'a0300000-0000-4000-8000-000000000009',
    'a0300000-0000-4000-8000-000000000002',
    'a0300000-0000-4000-8000-000000000006',
    1,
    'fixture',
    'fixture-model',
    'conversation-caution-reply-run',
    'fixture-v1',
    'fixture-v1',
    1,
    'succeeded'
  ),
  (
    'a0300000-0000-4000-8000-000000000014',
    'a0300000-0000-4000-8000-000000000002',
    'a0300000-0000-4000-8000-000000000013',
    1,
    'fixture',
    'fixture-model',
    'conversation-risk-reply-run',
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
    'a0300000-0000-4000-8000-000000000010',
    'a0300000-0000-4000-8000-000000000002',
    'a0300000-0000-4000-8000-000000000004',
    'a0300000-0000-4000-8000-000000000007',
    1,
    'constructive_feedback',
    0.82,
    'caution',
    0.2,
    0.01,
    0.01,
    true,
    'review',
    true,
    false,
    '설명 개선 요청',
    1,
    '{}'
  ),
  (
    'a0300000-0000-4000-8000-000000000011',
    'a0300000-0000-4000-8000-000000000002',
    'a0300000-0000-4000-8000-000000000005',
    'a0300000-0000-4000-8000-000000000008',
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
    '안전한 작성자 답글',
    1,
    '{}'
  ),
  (
    'a0300000-0000-4000-8000-000000000012',
    'a0300000-0000-4000-8000-000000000002',
    'a0300000-0000-4000-8000-000000000006',
    'a0300000-0000-4000-8000-000000000009',
    1,
    'toxic_but_actionable',
    0.76,
    'caution',
    0.55,
    0.01,
    0.01,
    true,
    'review',
    true,
    false,
    '주의가 필요한 답글',
    1,
    '{}'
  ),
  (
    'a0300000-0000-4000-8000-000000000015',
    'a0300000-0000-4000-8000-000000000002',
    'a0300000-0000-4000-8000-000000000013',
    'a0300000-0000-4000-8000-000000000014',
    1,
    'abusive_no_signal',
    0.96,
    'risk',
    0.95,
    0.01,
    0.01,
    false,
    'reject',
    true,
    true,
    '원문 보호가 필요한 답글',
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
    'a0300000-0000-4000-8000-000000000002',
    'a0300000-0000-4000-8000-000000000010',
    '3:20 구간을 다른 방식으로 설명해 달라는 요청',
    null,
    false
  ),
  (
    'a0300000-0000-4000-8000-000000000002',
    'a0300000-0000-4000-8000-000000000011',
    '좋은 지적 감사합니다.',
    null,
    false
  ),
  (
    'a0300000-0000-4000-8000-000000000002',
    'a0300000-0000-4000-8000-000000000012',
    '다른 방법도 궁금하다는 의견',
    null,
    false
  );

select plan(6);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a0300000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)::integer
    from public.get_inbox_conversation_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  1,
  'conversation Inbox returns top-level rows only'
);

select is(
  (
    select reply_count
    from public.get_inbox_conversation_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  3::bigint,
  'conversation rows count stored replies'
);

select is(
  (
    select safe_source_text
    from public.get_inbox_conversation_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  '3:20 구간 설명이 이해가 안 돼요.',
  'caution top-level source is available in the conversation'
);

select is(
  (
    select replies -> 0 ->> 'safeSourceText'
    from public.get_inbox_conversation_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  '좋은 지적 감사합니다.',
  'safe reply source is available in the conversation'
);

select is(
  (
    select replies -> 1 ->> 'safeSourceText'
    from public.get_inbox_conversation_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  '주의 답글 원문',
  'caution reply source is available in the conversation'
);

select is(
  (
    select replies -> 2 ->> 'safeSourceText'
    from public.get_inbox_conversation_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  null,
  'risk reply source is omitted from the conversation'
);

select * from finish();

rollback;
