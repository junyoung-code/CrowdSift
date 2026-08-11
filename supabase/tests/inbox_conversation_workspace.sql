begin;

create extension if not exists pgtap with schema extensions;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  'a0300000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'classification-inbox@example.test',
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
  'Classification Inbox'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  'a0300000-0000-4000-8000-000000000002',
  'a0300000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.youtube_videos (
  workspace_id, youtube_channel_id, youtube_video_id, title
)
values (
  'a0300000-0000-4000-8000-000000000002',
  'channel-classification',
  'video-classification',
  '분류 테스트 영상'
);

insert into public.comment_import_jobs (
  id, workspace_id, youtube_video_id, requested_top_level_count, status
)
values (
  'a0300000-0000-4000-8000-000000000003',
  'a0300000-0000-4000-8000-000000000002',
  'video-classification',
  20,
  'succeeded'
);

insert into public.raw_comments (
  id, workspace_id, youtube_video_id, youtube_comment_id,
  parent_youtube_comment_id, author_display_name, text_display,
  published_at, first_import_job_id
)
values
  (
    'a0300000-0000-4000-8000-000000000004',
    'a0300000-0000-4000-8000-000000000002',
    'video-classification',
    'parent-classification',
    null,
    'viewer',
    '편집 개느리네.',
    '2026-08-07T10:00:00Z',
    'a0300000-0000-4000-8000-000000000003'
  ),
  (
    'a0300000-0000-4000-8000-000000000005',
    'a0300000-0000-4000-8000-000000000002',
    'video-classification',
    'reply-classification',
    'parent-classification',
    'creator',
    '좋은 지적 감사합니다.',
    '2026-08-07T10:05:00Z',
    'a0300000-0000-4000-8000-000000000003'
  );

insert into public.comment_import_items (
  import_job_id, workspace_id, youtube_comment_id, raw_comment_id, status
)
values
  (
    'a0300000-0000-4000-8000-000000000003',
    'a0300000-0000-4000-8000-000000000002',
    'parent-classification',
    'a0300000-0000-4000-8000-000000000004',
    'succeeded'
  ),
  (
    'a0300000-0000-4000-8000-000000000003',
    'a0300000-0000-4000-8000-000000000002',
    'reply-classification',
    'a0300000-0000-4000-8000-000000000005',
    'succeeded'
  );

insert into public.analysis_jobs (
  id, workspace_id, import_job_id, configuration_key,
  status, total_count, completed_count
)
values (
  'a0300000-0000-4000-8000-000000000006',
  'a0300000-0000-4000-8000-000000000002',
  'a0300000-0000-4000-8000-000000000003',
  'classification-v1-test',
  'succeeded',
  2,
  2
);

insert into public.analysis_job_items (
  id, analysis_job_id, workspace_id, raw_comment_id, status
)
values
  (
    'a0300000-0000-4000-8000-000000000007',
    'a0300000-0000-4000-8000-000000000006',
    'a0300000-0000-4000-8000-000000000002',
    'a0300000-0000-4000-8000-000000000004',
    'succeeded'
  ),
  (
    'a0300000-0000-4000-8000-000000000008',
    'a0300000-0000-4000-8000-000000000006',
    'a0300000-0000-4000-8000-000000000002',
    'a0300000-0000-4000-8000-000000000005',
    'succeeded'
  );

insert into public.classification_stage_runs (
  workspace_id, raw_comment_id, analysis_job_item_id, stage,
  provider, model_identifier, idempotency_key, prompt_version,
  schema_version, policy_version, latency_ms, usage, status, output
)
values
  (
    'a0300000-0000-4000-8000-000000000002',
    'a0300000-0000-4000-8000-000000000004',
    'a0300000-0000-4000-8000-000000000007',
    'moderation',
    'openai',
    'omni-moderation-latest',
    'classification-test-moderation',
    null,
    'classification-v1',
    1,
    10,
    '{}',
    'succeeded',
    '{"flagged":true,"categories":["harassment"],"unknownCategories":[],"categoryScores":{"harassment":0.82}}'
  ),
  (
    'a0300000-0000-4000-8000-000000000002',
    'a0300000-0000-4000-8000-000000000004',
    'a0300000-0000-4000-8000-000000000007',
    'luna',
    'openai',
    'gpt-5.6-luna',
    'classification-test-luna',
    'luna-v1',
    'classification-v1',
    1,
    20,
    '{"inputTokens":10,"outputTokens":5,"totalTokens":15}',
    'succeeded',
    '{"candidateLevel":"caution","certainty":"clear","feedbackPresent":true,"locationOrScheduleMention":false,"sensitiveTopicMatched":false,"hardRiskFlags":[],"softRiskFlags":["profanity"],"matchedRules":[]}'
  );

insert into public.classification_branches (
  workspace_id, raw_comment_id, analysis_job_item_id,
  outcome, reasons, protection
)
values (
  'a0300000-0000-4000-8000-000000000002',
  'a0300000-0000-4000-8000-000000000004',
  'a0300000-0000-4000-8000-000000000007',
  'verify',
  '["luna_caution","moderation_flagged"]',
  '{"hideSourceBeforeVerdict":true,"moderationMinimumLevel":"caution","maySignalSelfHarmCase":false}'
);

insert into public.classification_verdicts (
  workspace_id, raw_comment_id, analysis_job_item_id, status, level,
  basis, agreed_with_first_pass, hide_source, recommended_actions,
  reason_codes, feedback_type, feedback_core
)
values
  (
    'a0300000-0000-4000-8000-000000000002',
    'a0300000-0000-4000-8000-000000000004',
    'a0300000-0000-4000-8000-000000000007',
    'decided',
    'caution',
    'both_agreed',
    true,
    true,
    '["show_rewritten_only"]',
    '["profanity"]',
    'actionable',
    '편집 흐름을 빠르게 해 달라는 요청'
  ),
  (
    'a0300000-0000-4000-8000-000000000002',
    'a0300000-0000-4000-8000-000000000005',
    'a0300000-0000-4000-8000-000000000008',
    'decided',
    'safe',
    'instant_safe',
    null,
    false,
    '["show_source"]',
    '[]',
    'none',
    null
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
  'classification Inbox returns one top-level comment'
);

select is(
  (
    select reply_count
    from public.get_inbox_conversation_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  1::bigint,
  'classification Inbox keeps stored replies'
);

select is(
  (
    select safe_source_text
    from public.get_inbox_conversation_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  null,
  'caution source is hidden by the final verdict'
);

select is(
  (
    select neutral_text
    from public.get_inbox_conversation_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  '편집 흐름을 빠르게 해 달라는 요청',
  'feedback core is available without exposing source text'
);

select is(
  (
    select replies -> 0 ->> 'safeSourceText'
    from public.get_inbox_conversation_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  '좋은 지적 감사합니다.',
  'safe reply source remains visible'
);

select is(
  (
    select classification_trace -> 'moderation' -> 'output'
      -> 'categoryScores' ->> 'harassment'
    from public.get_inbox_conversation_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  '0.82',
  'classification trace preserves the moderation score'
);

select * from finish();

rollback;
