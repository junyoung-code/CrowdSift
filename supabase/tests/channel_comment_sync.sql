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
values
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'authenticated',
    'authenticated',
    'channel-sync-owner@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'authenticated',
    'authenticated',
    'other-channel-sync-owner@example.test',
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
    '55555555-5555-5555-5555-555555555555',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'Channel sync workspace'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'Other channel sync workspace'
  );

insert into public.workspace_members (workspace_id, user_id, role)
values
  (
    '55555555-5555-5555-5555-555555555555',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'owner'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'owner'
  );

insert into public.youtube_connections (
  id,
  workspace_id,
  status,
  encrypted_access_token
)
values
  (
    '66666666-6666-6666-6666-666666666666',
    '55555555-5555-5555-5555-555555555555',
    'connected',
    'sealed-access-token'
  ),
  (
    '77777777-7777-7777-7777-777777777777',
    '44444444-4444-4444-4444-444444444444',
    'connected',
    'other-sealed-access-token'
  );

insert into public.youtube_channel_candidates (
  connection_id,
  workspace_id,
  youtube_channel_id,
  title,
  selected
)
values
  (
    '66666666-6666-6666-6666-666666666666',
    '55555555-5555-5555-5555-555555555555',
    'channel-sync-a',
    'Channel Sync A',
    true
  ),
  (
    '77777777-7777-7777-7777-777777777777',
    '44444444-4444-4444-4444-444444444444',
    'channel-sync-b',
    'Channel Sync B',
    true
  );

select plan(37);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$
    select backfill_start_at::date
    from public.configure_channel_comment_sync(
      '55555555-5555-5555-5555-555555555555'::uuid,
      date '2026-08-01'
    )
  $$,
  array[date '2026-08-01'],
  'stores the selected start date'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.claim_channel_comment_sync_work_for_workspace(uuid,integer)',
    'execute'
  ),
  false,
  'authenticated clients cannot execute the workspace claimant directly'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (
    select count(*)
    from public.claim_channel_comment_sync_work_for_workspace(
      '55555555-5555-5555-5555-555555555555'::uuid,
      240
    )
  ),
  1::bigint,
  'claims only the requested workspace'
);

select results_eq(
  $$
    select workspace_id, kind, input_page_token
    from public.channel_comment_sync_runs
    where status = 'running'
  $$,
  $$
    values (
      '55555555-5555-5555-5555-555555555555'::uuid,
      'backfill_recent'::text,
      null::text
    )
  $$,
  'the first claim creates a scoped backfill run'
);

select ok(
  (
    select lease_until > now()
    from public.channel_comment_sync_settings
    where workspace_id = '55555555-5555-5555-5555-555555555555'
  ),
  'claiming work acquires a lease'
);

select results_eq(
  $$
    select
      status,
      output_page_token,
      observed_count,
      stored_count,
      updated_count,
      duplicate_count,
      failed_count,
      analyzed_count,
      quota_units_used
    from public.complete_channel_comment_sync_run(
      (
        select id
        from public.channel_comment_sync_runs
        where status = 'running'
      ),
      'backfill-next',
      false,
      12,
      5,
      2,
      3,
      2,
      5,
      1
    )
  $$,
  $$ values ('succeeded'::text, 'backfill-next'::text, 12, 5, 2, 3, 2, 5, 1) $$,
  'completing a page records the page metrics'
);

select results_eq(
  $$
    select backfill_status, backfill_page_token, lease_until
    from public.channel_comment_sync_settings
    where workspace_id = '55555555-5555-5555-5555-555555555555'
  $$,
  $$ values ('pending'::text, 'backfill-next'::text, null::timestamptz) $$,
  'a backfill next page remains pending and releases its lease'
);

create temporary table second_backfill_claim on commit drop as
select *
from public.claim_channel_comment_sync_work_for_workspace(
  '55555555-5555-5555-5555-555555555555'::uuid,
  240
);

select results_eq(
  $$ select run_kind, page_token from second_backfill_claim $$,
  $$ values ('backfill_recent'::text, 'backfill-next'::text) $$,
  'the next backfill claim resumes from the stored page token'
);

select lives_ok(
  format(
    $$
      select public.complete_channel_comment_sync_run(
        %L::uuid,
        'unused-provider-token',
        true,
        4,
        2,
        0,
        2,
        0,
        2,
        1
      )
    $$,
    (select run_id from second_backfill_claim)
  ),
  'a backfill run can complete at the inclusive cutoff'
);

select results_eq(
  $$
    select backfill_status, backfill_page_token, lease_until
    from public.channel_comment_sync_settings
    where workspace_id = '55555555-5555-5555-5555-555555555555'
  $$,
  $$ values ('completed'::text, null::text, null::timestamptz) $$,
  'reaching the cutoff completes backfill and discards the provider token'
);

create temporary table first_incremental_claim on commit drop as
select *
from public.claim_channel_comment_sync_work_for_workspace(
  '55555555-5555-5555-5555-555555555555'::uuid,
  240
);

select results_eq(
  $$ select run_kind from first_incremental_claim $$,
  $$ values ('incremental'::text) $$,
  'the next due claim starts incremental sync'
);

select ok(
  (select incremental_scan_started_at is not null from first_incremental_claim),
  'the first incremental page fixes a scan start timestamp'
);

select is(
  (
    select s.incremental_scan_started_at
    from public.channel_comment_sync_settings s
    where s.workspace_id = '55555555-5555-5555-5555-555555555555'
  ),
  (select incremental_scan_started_at from first_incremental_claim),
  'the claimed incremental watermark is persisted on the setting'
);

select lives_ok(
  format(
    $$
      select public.complete_channel_comment_sync_run(
        %L::uuid,
        'incremental-next',
        false,
        6,
        3,
        1,
        2,
        0,
        3,
        1
      )
    $$,
    (select run_id from first_incremental_claim)
  ),
  'an incremental scan can persist a next page'
);

update public.channel_comment_sync_settings
set incremental_scan_started_at = '2026-08-08T00:00:00Z'
where workspace_id = '55555555-5555-5555-5555-555555555555';

create temporary table second_incremental_claim on commit drop as
select *
from public.claim_channel_comment_sync_work_for_workspace(
  '55555555-5555-5555-5555-555555555555'::uuid,
  240
);

select results_eq(
  $$
    select page_token, incremental_scan_started_at
    from second_incremental_claim
  $$,
  $$ values ('incremental-next'::text, '2026-08-08T00:00:00Z'::timestamptz) $$,
  'incremental pagination resumes without moving the fixed scan timestamp'
);

select lives_ok(
  format(
    $$
      select public.complete_channel_comment_sync_run(
        %L::uuid,
        null,
        true,
        2,
        1,
        0,
        1,
        0,
        1,
        1
      )
    $$,
    (select run_id from second_incremental_claim)
  ),
  'an incremental scan can complete at its previous watermark'
);

select results_eq(
  $$
    select
      last_successful_sync_at,
      incremental_scan_started_at,
      incremental_page_token,
      lease_until,
      next_sync_at > now()
    from public.channel_comment_sync_settings
    where workspace_id = '55555555-5555-5555-5555-555555555555'
  $$,
  $$
    values (
      '2026-08-08T00:00:00Z'::timestamptz,
      null::timestamptz,
      null::text,
      null::timestamptz,
      true
    )
  $$,
  'incremental completion advances the watermark and schedules the next hour'
);

create temporary table first_reply_claim on commit drop as
select *
from public.claim_channel_comment_sync_work_for_workspace(
  '55555555-5555-5555-5555-555555555555'::uuid,
  240
);

select results_eq(
  $$ select run_kind from first_reply_claim $$,
  $$ values ('reply_reconciliation'::text) $$,
  'pending reply reconciliation is claimed after incremental work'
);

select lives_ok(
  format(
    $$
      select public.complete_channel_comment_sync_run(
        %L::uuid,
        null,
        false,
        20,
        1,
        0,
        19,
        0,
        1,
        20,
        'reply-cursor-2'
      )
    $$,
    (select run_id from first_reply_claim)
  ),
  'reply reconciliation can persist its next parent cursor'
);

select results_eq(
  $$
    select
      reply_reconciliation_status,
      reply_reconciliation_page_token,
      lease_until
    from public.channel_comment_sync_settings
    where workspace_id = '55555555-5555-5555-5555-555555555555'
  $$,
  $$ values ('pending'::text, 'reply-cursor-2'::text, null::timestamptz) $$,
  'a remaining reply cursor schedules the next batch immediately'
);

create temporary table second_reply_claim on commit drop as
select *
from public.claim_channel_comment_sync_work_for_workspace(
  '55555555-5555-5555-5555-555555555555'::uuid,
  240
);

select results_eq(
  $$ select run_kind, page_token from second_reply_claim $$,
  $$ values ('reply_reconciliation'::text, 'reply-cursor-2'::text) $$,
  'the next reply batch resumes from its parent cursor'
);

select lives_ok(
  format(
    $$
      select public.complete_channel_comment_sync_run(
        %L::uuid,
        null,
        false,
        3,
        1,
        0,
        2,
        0,
        1,
        3,
        null
      )
    $$,
    (select run_id from second_reply_claim)
  ),
  'the last reply batch can finish without a cursor'
);

select results_eq(
  $$
    select
      reply_reconciliation_status,
      reply_reconciliation_page_token,
      last_reply_reconciliation_at is not null,
      next_reply_reconciliation_at =
        last_reply_reconciliation_at + interval '24 hours'
    from public.channel_comment_sync_settings
    where workspace_id = '55555555-5555-5555-5555-555555555555'
  $$,
  $$ values ('completed'::text, null::text, true, true) $$,
  'finished reply reconciliation schedules another pass in 24 hours'
);

update public.channel_comment_sync_settings
set next_sync_at = now()
where workspace_id = '55555555-5555-5555-5555-555555555555';

create temporary table failed_incremental_claim on commit drop as
select *
from public.claim_channel_comment_sync_work_for_workspace(
  '55555555-5555-5555-5555-555555555555'::uuid,
  240
);

select results_eq(
  $$ select run_kind from failed_incremental_claim $$,
  $$ values ('incremental'::text) $$,
  'due incremental work can be claimed again'
);

select results_eq(
  format(
    $$
      select status, error_code
      from public.fail_channel_comment_sync_run(%L::uuid, 'youtube_quota_exceeded')
    $$,
    (select run_id from failed_incremental_claim)
  ),
  $$ values ('failed'::text, 'youtube_quota_exceeded'::text) $$,
  'failing a run stores its stable error code'
);

select results_eq(
  $$
    select last_error_code, lease_until, next_sync_at > now()
    from public.channel_comment_sync_settings
    where workspace_id = '55555555-5555-5555-5555-555555555555'
  $$,
  $$ values ('youtube_quota_exceeded'::text, null::timestamptz, true) $$,
  'a failed incremental run releases its lease and schedules a retry'
);

select is(
  (
    select count(*)
    from public.claim_channel_comment_sync_work_for_workspace(
      '55555555-5555-5555-5555-555555555555'::uuid,
      240
    )
  ),
  0::bigint,
  'failed work is not reclaimed before its retry time'
);

insert into public.comment_import_jobs (
  workspace_id,
  youtube_video_id,
  source_kind,
  trigger_kind,
  channel_sync_run_id
)
values (
  '55555555-5555-5555-5555-555555555555',
  'sync-video-1',
  'owned_oauth',
  'channel_sync',
  (select run_id from failed_incremental_claim)
);

select throws_ok(
  format(
    $$
      insert into public.comment_import_jobs (
        workspace_id,
        youtube_video_id,
        source_kind,
        trigger_kind,
        channel_sync_run_id
      )
      values (
        '55555555-5555-5555-5555-555555555555',
        'sync-video-1',
        'owned_oauth',
        'channel_sync',
        %L::uuid
      )
    $$,
    (select run_id from failed_incremental_claim)
  ),
  '23505',
  null,
  'one sync run reuses one import job per YouTube video'
);

select throws_ok(
  $$
    select *
    from public.claim_channel_comment_sync_work_for_workspace(
      '44444444-4444-4444-4444-444444444444'::uuid,
      240
    )
  $$,
  '42501',
  'workspace access denied',
  'a member cannot claim another workspace through the scoped worker'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$
    select public.configure_channel_comment_sync(
      '44444444-4444-4444-4444-444444444444'::uuid,
      date '2026-08-01'
    )
  $$,
  '42501',
  'workspace access denied',
  'a member cannot configure another workspace'
);

select throws_ok(
  $$
    select public.request_channel_comment_sync_now(
      '44444444-4444-4444-4444-444444444444'::uuid
    )
  $$,
  '42501',
  'workspace access denied',
  'a member cannot request sync for another workspace'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.complete_channel_comment_sync_run(uuid,text,boolean,integer,integer,integer,integer,integer,integer,integer,text)',
    'execute'
  ),
  false,
  'authenticated clients cannot complete sync runs'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.fail_channel_comment_sync_run(uuid,text)',
    'execute'
  ),
  false,
  'authenticated clients cannot fail sync runs'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.store_import_comment_item(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,timestamptz,timestamptz,jsonb)',
    'execute'
  ),
  false,
  'authenticated clients cannot call the raw comment storage RPC'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.configure_channel_comment_sync(uuid,date)',
    'execute'
  ),
  true,
  'authenticated members retain the configuration RPC'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.set_channel_comment_sync_enabled(uuid,boolean)',
    'execute'
  ),
  true,
  'authenticated members retain the enable and disable RPC'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.request_channel_comment_sync_now(uuid)',
    'execute'
  ),
  true,
  'authenticated members retain the request-now RPC'
);

select * from finish();

rollback;
