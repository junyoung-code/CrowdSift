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

select plan(18);

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
    from public.get_inbox_feed_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  1,
  'classification Inbox returns one top-level comment'
);

select is(
  (
    select reply_count
    from public.get_inbox_feed_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  1::bigint,
  'classification Inbox keeps stored replies'
);

select is(
  (
    select safe_source_text
    from public.get_inbox_feed_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  null,
  'caution source is hidden by the final verdict'
);

select is(
  (
    select neutral_text
    from public.get_inbox_feed_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  '편집 흐름을 빠르게 해 달라는 요청',
  'feedback core is available without exposing source text'
);

select is(
  (
    select replies -> 0 ->> 'safeSourceText'
    from public.get_inbox_feed_page(
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
    from public.get_inbox_feed_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  '0.82',
  'classification trace preserves the moderation score'
);

reset role;
insert into public.classification_feedback (
  workspace_id,
  raw_comment_id,
  classification_verdict_id,
  actor_user_id,
  decision,
  corrected_status,
  corrected_level,
  corrected_category,
  corrected_recommended_action,
  source_import_job_id,
  correction_reason,
  use_for_personalization,
  use_for_training
)
select
  'a0300000-0000-4000-8000-000000000002',
  'a0300000-0000-4000-8000-000000000004',
  cv.id,
  'a0300000-0000-4000-8000-000000000001',
  'corrected',
  'review_queue',
  null,
  'uncertain',
  'review',
  'a0300000-0000-4000-8000-000000000003',
  '맥락이 부족해 직접 확인이 필요함',
  false,
  false
from public.classification_verdicts cv
where cv.raw_comment_id = 'a0300000-0000-4000-8000-000000000004';

set local role authenticated;
select is(
  (
    select classification_status
    from public.get_inbox_feed_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  'review_queue',
  'a creator can move a decided comment to the review queue'
);
select is(
  (
    select review_level::text
    from public.get_inbox_feed_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  null,
  'a creator hold does not masquerade as a concrete review level'
);
select is(
  (
    select classification_trace -> 'final' ->> 'status'
    from public.get_inbox_feed_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  'decided',
  'the original AI verdict remains available for audit'
);

reset role;
-- Existing fixture stays transaction-local; never mutate an actual user's comments.
insert into public.raw_comments (
  id, workspace_id, youtube_video_id, youtube_comment_id, author_display_name,
  text_display, published_at, first_import_job_id, like_count
)
select md5('inbox-filter-' || g)::uuid,
  'a0300000-0000-4000-8000-000000000002', 'video-classification',
  'inbox-filter-' || g, 'filter-author-' || g, 'filter fixture ' || g,
  (((current_timestamp at time zone 'Asia/Seoul')::date - (g - 1))::timestamp at time zone 'Asia/Seoul'),
  'a0300000-0000-4000-8000-000000000003', g
from generate_series(1, 30) g;
insert into public.comment_import_items (import_job_id, workspace_id, youtube_comment_id, raw_comment_id, status)
select 'a0300000-0000-4000-8000-000000000003', 'a0300000-0000-4000-8000-000000000002',
  'inbox-filter-' || g, md5('inbox-filter-' || g)::uuid, 'succeeded'
from generate_series(1, 30) g;
set local role authenticated;

select is((select count(*)::integer from public.get_inbox_feed_page(target_workspace_id => 'a0300000-0000-4000-8000-000000000002', period_filter => '7d')), 7, 'seven days includes the Seoul midnight boundary');
select is((select total_count from public.get_inbox_feed_page(target_workspace_id => 'a0300000-0000-4000-8000-000000000002', period_filter => '30d', page_size => 1)), 30::bigint, 'date filtering happens before count and pagination');
select is((select like_count from public.get_inbox_feed_page(target_workspace_id => 'a0300000-0000-4000-8000-000000000002', sort_order => 'likes', page_size => 1)), 30, 'likes sort considers all comments beyond the first page');
select is((select like_count from public.get_inbox_feed_page(target_workspace_id => 'a0300000-0000-4000-8000-000000000002', sort_order => 'latest', page_size => 1)), 1, 'latest sort uses the comment publication time');
select is((select count(*)::integer from public.get_inbox_feed_page(target_workspace_id => 'a0300000-0000-4000-8000-000000000002', period_filter => '30d', page_offset => 25)), 5, 'second page preserves the date filter');
select is((select count(*)::integer from public.get_inbox_feed_page(target_workspace_id => 'a0300000-0000-4000-8000-000000000002', search_query => 'filter-author-30')), 1, 'search matches stored author names');
select is((select count(*)::integer from public.get_inbox_feed_page(target_workspace_id => 'a0300000-0000-4000-8000-000000000002', review_levels => array['safe']::public.review_level[])), 0, 'safe filter excludes caution and unclassified comments');
select throws_ok($$select * from public.get_inbox_feed_page(target_workspace_id => 'a0300000-0000-4000-8000-000000000002', sort_order => 'invalid')$$, '22023', 'invalid sort order', 'invalid sort values are rejected');
select set_config('request.jwt.claim.sub', 'b0300000-0000-4000-8000-000000000001', true);
select throws_ok($$select * from public.get_inbox_feed_page(target_workspace_id => 'a0300000-0000-4000-8000-000000000002')$$, '42501', 'workspace access denied', 'a nonmember cannot read the feed');
select * from finish();

rollback;
