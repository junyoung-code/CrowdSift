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

select plan(20);
insert into public.semantic_snapshots(analysis_job_item_id,workspace_id,raw_comment_id,configuration_key,context,settings)
values('a0300000-0000-4000-8000-000000000007','a0300000-0000-4000-8000-000000000002','a0300000-0000-4000-8000-000000000004','semantic-v1:1:test','{"sourceText":"private evidence"}','{}');
insert into public.semantic_attempts(analysis_job_item_id,workspace_id,stage,attempt,status,output)
values('a0300000-0000-4000-8000-000000000007','a0300000-0000-4000-8000-000000000002','semantic_analysis',1,'succeeded','{"meaningClear":true}'),
('a0300000-0000-4000-8000-000000000007','a0300000-0000-4000-8000-000000000002','feedback_rewrite',1,'succeeded','{"text":"private unvalidated"}'),
('a0300000-0000-4000-8000-000000000007','a0300000-0000-4000-8000-000000000002','rewrite_validation',1,'succeeded','{"nothingAdded":false}');
insert into public.classification_verdicts(id,analysis_job_item_id,workspace_id,raw_comment_id,status,level,basis,hide_source,feedback_type,feedback_core,pipeline_version,rewrite_status,semantic_trace)
values('a0300000-0000-4000-8000-000000000009','a0300000-0000-4000-8000-000000000007','a0300000-0000-4000-8000-000000000002','a0300000-0000-4000-8000-000000000004','decided','safe','no_related_harm',true,'none','private unvalidated','semantic-v1','failed','{"version":"semantic-v1","otherTargetHarm":true,"rewriteStatus":"failed"}');
select throws_ok($$insert into public.semantic_attempts(analysis_job_item_id,workspace_id,stage,attempt,status) values('a0300000-0000-4000-8000-000000000007','a0300000-0000-4000-8000-000000000002','semantic_analysis',1,'succeeded')$$,'23505',null,'duplicate attempt cannot overwrite a success');
select lives_ok($$select public.retry_semantic_rewrite('a0300000-0000-4000-8000-000000000009','a0300000-0000-4000-8000-000000000002')$$,'retry begins a new rewrite cycle');
select is((select metadata->'afterAttempts'->>'feedback_rewrite' from public.audit_logs where event_type='classification.rewrite_retry' and target_id='a0300000-0000-4000-8000-000000000007'),'1','retry boundary uses stage counter even with equal timestamps');
select is((select count(*)::integer from public.semantic_attempts where analysis_job_item_id='a0300000-0000-4000-8000-000000000007'),3,'retry preserves every previous attempt');
select throws_ok($$select public.retry_semantic_rewrite('a0300000-0000-4000-8000-000000000009','a0300000-0000-4000-8000-000000000002')$$,'P0001','rewrite_not_retryable','duplicate retry cannot reset an active cycle');
select is((select status::text from public.analysis_job_items where id='a0300000-0000-4000-8000-000000000008'),'succeeded','retry leaves other completed item alone');
set local role authenticated;
select set_config('request.jwt.claim.sub','a0300000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.semantic_snapshots where analysis_job_item_id='a0300000-0000-4000-8000-000000000007'),1,'member can inspect own private analysis');
select is((select count(*)::integer from public.get_inbox_feed_page(target_workspace_id=>'a0300000-0000-4000-8000-000000000002')),1,'protected source remains present in the feed');
select is((select classification_trace->'semantic'->>'otherTargetHarm' from public.get_inbox_feed_page(target_workspace_id=>'a0300000-0000-4000-8000-000000000002')),'true','semantic explanation is projected separately');
select ok(not exists(select 1 from public.get_inbox_feed_page(target_workspace_id=>'a0300000-0000-4000-8000-000000000002') row where row_to_json(row)::text like '%private unvalidated%'),'feed never falls back to unvalidated semantic core');
select ok(not exists(select 1 from public.get_inbox_feed_page(target_workspace_id=>'a0300000-0000-4000-8000-000000000002') row where row_to_json(row)::text like '%편집 개느리네.%'),'SAFE third-party harm still hides raw source');
select throws_ok($$select public.retry_semantic_rewrite('a0300000-0000-4000-8000-000000000009','a0300000-0000-4000-8000-000000000002')$$,'42501',null,'browser cannot directly invoke retry');
select set_config('request.jwt.claim.sub','a0300000-0000-4000-8000-000000000099',true);
select is((select count(*)::integer from public.semantic_snapshots where analysis_job_item_id='a0300000-0000-4000-8000-000000000007'),0,'other workspace cannot read snapshots');
select is((select count(*)::integer from public.semantic_attempts where analysis_job_item_id='a0300000-0000-4000-8000-000000000007'),0,'other workspace cannot read attempts');
reset role;
insert into public.analysis_jobs(workspace_id,import_job_id,configuration_key,status) values('a0300000-0000-4000-8000-000000000002','a0300000-0000-4000-8000-000000000003','semantic-v1:1:replacement','succeeded');
update public.analysis_jobs set configuration_key='legacy-test' where id='a0300000-0000-4000-8000-000000000006';
select lives_ok($$select public.supersede_legacy_classification_job('a0300000-0000-4000-8000-000000000006','semantic-v1:1:replacement','{}')$$,'unfinished legacy work is copied into a new job');
select is((select count(*)::integer from public.analysis_job_items where analysis_job_id=(select replacement_job_id from public.analysis_jobs where id='a0300000-0000-4000-8000-000000000006')),1,'only unfinished item moves');
select is((select count(*)::integer from public.claim_analysis_job_items('a0300000-0000-4000-8000-000000000006',5)),0,'superseded job cannot be claimed again');
select is((select count(*)::integer from public.classification_verdicts where analysis_job_item_id='a0300000-0000-4000-8000-000000000007'),1,'legacy result is preserved');
select is(public.supersede_legacy_classification_job('a0300000-0000-4000-8000-000000000006','semantic-v1:1:replacement','{}'),(select replacement_job_id from public.analysis_jobs where id='a0300000-0000-4000-8000-000000000006'),'migration is idempotent');
select is((select status::text from public.analysis_jobs where configuration_key='semantic-v1:1:replacement' and workspace_id='a0300000-0000-4000-8000-000000000002'),'pending','reused replacement is scheduled after unfinished items are added');
select * from finish();
rollback;
