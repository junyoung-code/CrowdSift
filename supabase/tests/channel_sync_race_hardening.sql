begin;

create extension if not exists pgtap with schema extensions;

set local timezone = 'Asia/Seoul';

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
  '12121212-1212-1212-1212-121212121212',
  'authenticated',
  'authenticated',
  'channel-race-owner@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.workspaces (id, owner_user_id, name)
values (
  '13131313-1313-1313-1313-131313131313',
  '12121212-1212-1212-1212-121212121212',
  'Channel race workspace'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  '13131313-1313-1313-1313-131313131313',
  '12121212-1212-1212-1212-121212121212',
  'owner'
);

insert into public.youtube_connections (
  id,
  workspace_id,
  status,
  encrypted_access_token
)
values (
  '14141414-1414-1414-1414-141414141414',
  '13131313-1313-1313-1313-131313131313',
  'connected',
  'sealed-access-token'
);

insert into public.youtube_channel_candidates (
  connection_id,
  workspace_id,
  youtube_channel_id,
  title,
  selected
)
values (
  '14141414-1414-1414-1414-141414141414',
  '13131313-1313-1313-1313-131313131313',
  'channel-race-a',
  'Channel Race A',
  true
);

select plan(27);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '12121212-1212-1212-1212-121212121212',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temporary table configured_race_setting on commit drop as
select id
from public.configure_channel_comment_sync(
  '13131313-1313-1313-1313-131313131313'::uuid,
  date '2026-08-01'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);

create temporary table stale_claim on commit drop as
select *
from public.claim_channel_comment_sync_work_for_workspace(
  '13131313-1313-1313-1313-131313131313'::uuid,
  '12121212-1212-1212-1212-121212121212'::uuid,
  240
);

select is(
  (select count(*) from stale_claim),
  1::bigint,
  'the race fixture obtains its first fenced claim'
);

create temporary table first_video_job on commit drop as
select id, status
from public.create_or_get_channel_sync_video_import_job(
  (select run_id from stale_claim),
  (select claim_token from stale_claim),
  '13131313-1313-1313-1313-131313131313'::uuid,
  'race-video',
  'live'
);

select results_eq(
  $$ select status from first_video_job $$,
  $$ values ('running'::public.job_status) $$,
  'an active claim creates a running per-video import job'
);

create temporary table first_stored_source on commit drop as
select *
from public.store_channel_sync_comment_item(
  (select id from first_video_job),
  (select run_id from stale_claim),
  (select claim_token from stale_claim),
  '13131313-1313-1313-1313-131313131313'::uuid,
  'race-video',
  'source-one',
  null,
  'author-one',
  'Author One',
  null,
  'source one',
  'source one',
  1,
  'published',
  '2026-08-08T00:00:00Z'::timestamptz,
  '2026-08-08T00:00:00Z'::timestamptz,
  '{"id":"source-one"}'::jsonb
);

select results_eq(
  $$ select disposition from first_stored_source $$,
  $$ values ('stored'::text) $$,
  'the active claim stores immutable source through the fenced RPC'
);

update public.channel_comment_sync_settings
set lease_until = now() - interval '1 second'
where workspace_id = '13131313-1313-1313-1313-131313131313';

create temporary table active_claim on commit drop as
select *
from public.claim_channel_comment_sync_work_for_workspace(
  '13131313-1313-1313-1313-131313131313'::uuid,
  '12121212-1212-1212-1212-121212121212'::uuid,
  240
);

select results_eq(
  $$
    select active.run_id = stale.run_id,
      active.claim_token <> stale.claim_token
    from active_claim active
    cross join stale_claim stale
  $$,
  $$ values (true, true) $$,
  'lease reclaim rotates the token on the same running run'
);

select throws_ok(
  format(
    $$
      select public.create_or_get_channel_sync_video_import_job(
        %L::uuid,
        %L::uuid,
        '13131313-1313-1313-1313-131313131313'::uuid,
        'stale-created-video',
        'live'
      )
    $$,
    (select run_id from stale_claim),
    (select claim_token from stale_claim)
  ),
  '40001',
  'channel sync lease claim is stale',
  'a stale claim cannot create another per-video import job'
);

select is(
  (
    select count(*)
    from public.comment_import_jobs
    where workspace_id = '13131313-1313-1313-1313-131313131313'
      and youtube_video_id = 'stale-created-video'
  ),
  0::bigint,
  'rejected stale creation leaves no import job'
);

select throws_ok(
  format(
    $$
      select public.store_channel_sync_comment_item(
        %L::uuid,
        %L::uuid,
        %L::uuid,
        '13131313-1313-1313-1313-131313131313'::uuid,
        'race-video',
        'stale-comment',
        null,
        null,
        null,
        null,
        'stale source',
        'stale source',
        0,
        'published',
        now(),
        now(),
        '{"id":"stale-comment"}'::jsonb
      )
    $$,
    (select id from first_video_job),
    (select run_id from stale_claim),
    (select claim_token from stale_claim)
  ),
  '40001',
  'channel sync lease claim is stale',
  'a stale claim cannot append source to the reclaimed import job'
);

select results_eq(
  $$
    select
      (select count(*) from public.raw_comments where youtube_comment_id = 'stale-comment'),
      (select count(*) from public.comment_import_items where youtube_comment_id = 'stale-comment'),
      (select count(*) from public.comment_source_observations where source_snapshot ->> 'youtubeCommentId' = 'stale-comment')
  $$,
  $$ values (0::bigint, 0::bigint, 0::bigint) $$,
  'rejected stale storage writes no raw source, import item, or observation'
);

select throws_ok(
  format(
    $$
      select public.attach_channel_sync_analysis_items(
        %L::uuid,
        %L::uuid,
        %L::uuid,
        '13131313-1313-1313-1313-131313131313'::uuid,
        'race-video',
        'classification-v1-key'
      )
    $$,
    (select id from first_video_job),
    (select run_id from stale_claim),
    (select claim_token from stale_claim)
  ),
  '40001',
  'channel sync lease claim is stale',
  'a stale claim cannot reserve or attach analysis work'
);

select is(
  (
    select id
    from public.create_or_get_channel_sync_video_import_job(
      (select run_id from active_claim),
      (select claim_token from active_claim),
      '13131313-1313-1313-1313-131313131313'::uuid,
      'race-video',
      'live'
    )
  ),
  (select id from first_video_job),
  'the active replacement claim reuses the same run-and-video job'
);

create temporary table second_stored_source on commit drop as
select *
from public.store_channel_sync_comment_item(
  (select id from first_video_job),
  (select run_id from active_claim),
  (select claim_token from active_claim),
  '13131313-1313-1313-1313-131313131313'::uuid,
  'race-video',
  'source-two',
  null,
  null,
  null,
  null,
  'source two',
  'source two',
  0,
  'published',
  '2026-08-08T00:01:00Z'::timestamptz,
  '2026-08-08T00:01:00Z'::timestamptz,
  '{"id":"source-two"}'::jsonb
);

select results_eq(
  $$ select disposition from second_stored_source $$,
  $$ values ('stored'::text) $$,
  'the replacement claim can continue source storage'
);

select results_eq(
  format(
    $$
      select status
      from public.fail_channel_comment_sync_run(
        %L::uuid,
        %L::uuid,
        'provider_error'
      )
    $$,
    (select run_id from active_claim),
    (select claim_token from active_claim)
  ),
  $$ values ('failed'::text) $$,
  'the active claim can fail its run before append rejection checks'
);

select throws_ok(
  format(
    $$
      select public.create_or_get_channel_sync_video_import_job(
        %L::uuid,
        %L::uuid,
        '13131313-1313-1313-1313-131313131313'::uuid,
        'after-failure-video',
        'live'
      )
    $$,
    (select run_id from active_claim),
    (select claim_token from active_claim)
  ),
  '55000',
  'channel sync run is not running',
  'a failed run cannot create another import job'
);

select throws_ok(
  format(
    $$
      select public.store_channel_sync_comment_item(
        %L::uuid,
        %L::uuid,
        %L::uuid,
        '13131313-1313-1313-1313-131313131313'::uuid,
        'race-video',
        'after-failure-comment',
        null,
        null,
        null,
        null,
        'after failure',
        'after failure',
        0,
        'published',
        now(),
        now(),
        '{"id":"after-failure-comment"}'::jsonb
      )
    $$,
    (select id from first_video_job),
    (select run_id from active_claim),
    (select claim_token from active_claim)
  ),
  '55000',
  'channel sync run is not running',
  'a failed run cannot append source to its failed import job'
);

select throws_ok(
  format(
    $$
      select public.record_channel_sync_import_item_failure(
        %L::uuid,
        %L::uuid,
        %L::uuid,
        '13131313-1313-1313-1313-131313131313'::uuid,
        'after-failure-comment',
        'source_store_failed'
      )
    $$,
    (select id from first_video_job),
    (select run_id from active_claim),
    (select claim_token from active_claim)
  ),
  '55000',
  'channel sync run is not running',
  'a failed run cannot append a failed import item either'
);

select results_eq(
  $$
    select
      (select count(*) from public.raw_comments where youtube_comment_id = 'after-failure-comment'),
      (select count(*) from public.comment_import_items where youtube_comment_id = 'after-failure-comment'),
      (select count(*) from public.comment_source_observations where source_snapshot ->> 'youtubeCommentId' = 'after-failure-comment')
  $$,
  $$ values (0::bigint, 0::bigint, 0::bigint) $$,
  'failed-job rejection leaves every source and import table unchanged'
);

select throws_ok(
  format(
    $$
      select public.store_import_comment_item(
        %L::uuid,
        '13131313-1313-1313-1313-131313131313'::uuid,
        'race-video',
        'unfenced-channel-comment',
        null,
        null,
        null,
        null,
        'unfenced channel source',
        'unfenced channel source',
        0,
        'published',
        now(),
        now(),
        '{"id":"unfenced-channel-comment"}'::jsonb
      )
    $$,
    (select id from first_video_job)
  ),
  '55000',
  'channel sync source storage requires a fenced claim',
  'the legacy storage RPC cannot bypass channel-sync fencing'
);

insert into public.comment_import_jobs (
  id,
  workspace_id,
  youtube_video_id,
  requested_top_level_count,
  source_kind,
  trigger_kind,
  status
)
values (
  '15151515-1515-1515-1515-151515151515',
  '13131313-1313-1313-1313-131313131313',
  'manual-video',
  20,
  'owned_oauth',
  'manual',
  'running'
);

select results_eq(
  $$
    select disposition
    from public.store_import_comment_item(
      '15151515-1515-1515-1515-151515151515'::uuid,
      '13131313-1313-1313-1313-131313131313'::uuid,
      'manual-video',
      'manual-comment',
      null,
      null,
      null,
      null,
      'manual source',
      'manual source',
      0,
      'published',
      now(),
      now(),
      '{"id":"manual-comment"}'::jsonb
    )
  $$,
  $$ values ('stored'::text) $$,
  'manual import source storage remains compatible with the legacy RPC'
);

insert into public.analysis_jobs (
  id,
  workspace_id,
  import_job_id,
  configuration_key,
  total_count
)
values (
  '16161616-1616-1616-1616-161616161616',
  '13131313-1313-1313-1313-131313131313',
  (select id from first_video_job),
  'classification-v1-key',
  1
);

insert into public.analysis_job_items (
  analysis_job_id,
  workspace_id,
  raw_comment_id
)
values (
  '16161616-1616-1616-1616-161616161616',
  '13131313-1313-1313-1313-131313131313',
  (select raw_comment_id from second_stored_source)
);

update public.channel_comment_sync_settings
set next_sync_at = now()
where workspace_id = '13131313-1313-1313-1313-131313131313';

create temporary table assignment_claim_one on commit drop as
select *
from public.claim_channel_comment_sync_work_for_workspace(
  '13131313-1313-1313-1313-131313131313'::uuid,
  '12121212-1212-1212-1212-121212121212'::uuid,
  240
);

select is(
  (select count(*) from assignment_claim_one),
  1::bigint,
  'the failed run retry obtains a new assignment claim'
);

create temporary table assignment_job_one on commit drop as
select id
from public.create_or_get_channel_sync_video_import_job(
  (select run_id from assignment_claim_one),
  (select claim_token from assignment_claim_one),
  '13131313-1313-1313-1313-131313131313'::uuid,
  'race-video',
  'live'
);

select public.finalize_channel_sync_video_import_job(
  (select id from assignment_job_one),
  (select run_id from assignment_claim_one),
  (select claim_token from assignment_claim_one),
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  null,
  'succeeded'
);

create temporary table first_assignment on commit drop as
select *
from public.attach_channel_sync_analysis_items(
  (select id from assignment_job_one),
  (select run_id from assignment_claim_one),
  (select claim_token from assignment_claim_one),
  '13131313-1313-1313-1313-131313131313'::uuid,
  'race-video',
  'classification-v1-key'
);

select results_eq(
  $$ select raw_comment_id from first_assignment $$,
  $$ select raw_comment_id from first_stored_source $$,
  'atomic attachment wins only the unassigned channel-sync source candidate'
);

select is(
  (
    select count(*)
    from public.channel_sync_analysis_assignments
    where workspace_id = '13131313-1313-1313-1313-131313131313'
      and configuration_key = 'classification-v1-key'
  ),
  1::bigint,
  'the unique assignment ledger records one raw-and-configuration winner'
);

select results_eq(
  $$
    select job.total_count, count(item.id)
    from public.analysis_jobs job
    left join public.analysis_job_items item on item.analysis_job_id = job.id
    where job.id = (select analysis_job_id from first_assignment)
    group by job.total_count
  $$,
  $$ values (1, 1::bigint) $$,
  'atomic attachment keeps the analysis job total and item count exact'
);

select public.complete_channel_comment_sync_run(
  (select run_id from assignment_claim_one),
  (select claim_token from assignment_claim_one),
  null,
  true,
  0,
  0,
  0,
  0,
  0,
  1,
  0
);

update public.channel_comment_sync_settings
set next_sync_at = now()
where workspace_id = '13131313-1313-1313-1313-131313131313';

create temporary table assignment_claim_two on commit drop as
select *
from public.claim_channel_comment_sync_work_for_workspace(
  '13131313-1313-1313-1313-131313131313'::uuid,
  '12121212-1212-1212-1212-121212121212'::uuid,
  240
);

select is(
  (select count(*) from assignment_claim_two),
  1::bigint,
  'a later channel-sync run obtains a distinct replay claim'
);

create temporary table assignment_job_two on commit drop as
select id
from public.create_or_get_channel_sync_video_import_job(
  (select run_id from assignment_claim_two),
  (select claim_token from assignment_claim_two),
  '13131313-1313-1313-1313-131313131313'::uuid,
  'race-video',
  'live'
);

select public.finalize_channel_sync_video_import_job(
  (select id from assignment_job_two),
  (select run_id from assignment_claim_two),
  (select claim_token from assignment_claim_two),
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  null,
  'succeeded'
);

select is(
  (
    select count(*)
    from public.attach_channel_sync_analysis_items(
      (select id from assignment_job_two),
      (select run_id from assignment_claim_two),
      (select claim_token from assignment_claim_two),
      '13131313-1313-1313-1313-131313131313'::uuid,
      'race-video',
      'classification-v1-key'
    )
  ),
  0::bigint,
  'replaying the same raw-and-configuration cannot win another run assignment'
);

select results_eq(
  $$
    select
      (select count(*) from public.analysis_jobs where import_job_id = (select id from assignment_job_two)),
      (select count(*) from public.channel_sync_analysis_assignments where raw_comment_id = (select raw_comment_id from first_stored_source))
  $$,
  $$ values (0::bigint, 1::bigint) $$,
  'a replay creates neither an empty analysis job nor a duplicate ledger row'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.create_or_get_channel_sync_video_import_job(uuid,uuid,uuid,text,text)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.store_channel_sync_comment_item(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,integer,text,timestamptz,timestamptz,jsonb)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.attach_channel_sync_analysis_items(uuid,uuid,uuid,uuid,text,text)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.record_channel_sync_import_item_failure(uuid,uuid,uuid,uuid,text,text)',
    'execute'
  ),
  'service workers can execute the race-hardened channel-sync RPCs'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_or_get_channel_sync_video_import_job(uuid,uuid,uuid,text,text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.store_channel_sync_comment_item(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,integer,text,timestamptz,timestamptz,jsonb)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.attach_channel_sync_analysis_items(uuid,uuid,uuid,uuid,text,text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.record_channel_sync_import_item_failure(uuid,uuid,uuid,uuid,text,text)',
    'execute'
  )
  and not has_table_privilege(
    'authenticated',
    'public.channel_sync_analysis_assignments',
    'select'
  ),
  'authenticated clients cannot execute race-hardened worker RPCs'
);

select * from finish();

rollback;
