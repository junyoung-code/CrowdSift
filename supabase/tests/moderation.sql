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
  '77777777-7777-4777-8777-777777777777',
  'authenticated',
  'authenticated',
  'moderation-owner@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.workspaces (id, owner_user_id, name)
values (
  '88888888-8888-4888-8888-888888888888',
  '77777777-7777-4777-8777-777777777777',
  'Moderation workspace'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  '88888888-8888-4888-8888-888888888888',
  '77777777-7777-4777-8777-777777777777',
  'owner'
);

insert into public.youtube_connections (
  id,
  workspace_id,
  status,
  updated_at
)
values (
  '12121212-1212-4212-8212-121212121212',
  '88888888-8888-4888-8888-888888888888',
  'connected',
  '2026-07-24T09:00:00.000Z'
);

insert into public.youtube_channel_candidates (
  connection_id,
  workspace_id,
  youtube_channel_id,
  title,
  selected
)
values (
  '12121212-1212-4212-8212-121212121212',
  '88888888-8888-4888-8888-888888888888',
  'creator-channel',
  'Creator channel',
  true
);

insert into public.comment_import_jobs (
  id,
  workspace_id,
  youtube_video_id,
  requested_top_level_count,
  status
)
values (
  '99999999-9999-4999-8999-999999999999',
  '88888888-8888-4888-8888-888888888888',
  'moderation-video',
  20,
  'succeeded'
);

insert into public.raw_comments (
  id,
  workspace_id,
  youtube_video_id,
  youtube_comment_id,
  author_channel_id,
  text_display,
  first_import_job_id
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '88888888-8888-4888-8888-888888888888',
  'moderation-video',
  'youtube-comment-1',
  'viewer-channel',
  '보존할 원문',
  '99999999-9999-4999-8999-999999999999'
);

select plan(18);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$
    select *
    from public.create_moderation_request_with_evidence(
      '88888888-8888-4888-8888-888888888888',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '77777777-7777-4777-8777-777777777777',
      'reject',
      'pending_confirmation',
      'moderation-idempotency-1',
      '{"source":{"youtubeCommentId":"youtube-comment-1"},"analysis":{"reviewLevel":"risk"}}',
      '12121212-1212-4212-8212-121212121212',
      'creator-channel',
      '2026-07-24T09:00:00.000Z'
    )
  $$,
  'request and immutable source evidence are created in one transaction'
);

select is(
  (
    select count(*)::integer
    from public.moderation_action_requests
    where idempotency_key = 'moderation-idempotency-1'
  ),
  1,
  'one moderation request is stored'
);

select is(
  (
    select count(*)::integer
    from public.evidence_records er
    join public.moderation_action_requests mar
      on mar.id = er.action_request_id
    where mar.idempotency_key = 'moderation-idempotency-1'
      and er.source_snapshot -> 'source' ->> 'youtubeCommentId'
        = 'youtube-comment-1'
  ),
  1,
  'the evidence snapshot is stored before execution'
);

select ok(
  not public.claim_moderation_request(
    '88888888-8888-4888-8888-888888888888',
    (
      select id
      from public.moderation_action_requests
      where idempotency_key = 'moderation-idempotency-1'
    ),
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    now()
  ),
  'a different actor cannot claim the request'
);

select ok(
  public.claim_moderation_request(
    '88888888-8888-4888-8888-888888888888',
    (
      select id
      from public.moderation_action_requests
      where idempotency_key = 'moderation-idempotency-1'
    ),
    '77777777-7777-4777-8777-777777777777',
    now()
  ),
  'the requesting actor can atomically claim the request once'
);

select ok(
  public.complete_moderation_request(
    '88888888-8888-4888-8888-888888888888',
    (
      select id
      from public.moderation_action_requests
      where idempotency_key = 'moderation-idempotency-1'
    ),
    '77777777-7777-4777-8777-777777777777',
    'succeeded',
    204,
    now(),
    null
  ),
  'a running request can be completed exactly once'
);

select is(
  (
    select state::text
    from public.moderation_action_requests
    where idempotency_key = 'moderation-idempotency-1'
  ),
  'succeeded',
  'the provider result is durably stored as succeeded'
);

select ok(
  public.complete_moderation_request(
    '88888888-8888-4888-8888-888888888888',
    (
      select id
      from public.moderation_action_requests
      where idempotency_key = 'moderation-idempotency-1'
    ),
    '77777777-7777-4777-8777-777777777777',
    'succeeded',
    204,
    now(),
    null
  ),
  'replaying the stored provider result is idempotent'
);

select is(
  (
    select count(*)::integer
    from public.audit_logs
    where event_type = 'moderation_succeeded'
      and target_type = 'moderation_action_request'
  ),
  1,
  'completion and its audit event are stored exactly once'
);

select lives_ok(
  $$
    select *
    from public.create_moderation_request_with_evidence(
      '88888888-8888-4888-8888-888888888888',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '77777777-7777-4777-8777-777777777777',
      'reject',
      'pending_confirmation',
      'moderation-idempotency-stale',
      '{"source":{"youtubeCommentId":"youtube-comment-1"},"analysis":{}}',
      '12121212-1212-4212-8212-121212121212',
      'creator-channel',
      '2026-07-24T09:00:00.000Z'
    )
  $$,
  'a second request can be bound for stale-result recovery'
);

select ok(
  public.claim_moderation_request(
    '88888888-8888-4888-8888-888888888888',
    (
      select id
      from public.moderation_action_requests
      where idempotency_key = 'moderation-idempotency-stale'
    ),
    '77777777-7777-4777-8777-777777777777',
    '2026-07-24T08:00:00.000Z'
  ),
  'the recovery fixture is claimed'
);

select ok(
  public.reconcile_stale_moderation_request(
    '88888888-8888-4888-8888-888888888888',
    (
      select id
      from public.moderation_action_requests
      where idempotency_key = 'moderation-idempotency-stale'
    ),
    '77777777-7777-4777-8777-777777777777',
    '2026-07-24T08:05:00.000Z',
    '2026-07-24T08:10:00.000Z'
  ),
  'a stale running request is reconciled without another provider call'
);

select is(
  (
    select error_code
    from public.moderation_action_requests
    where idempotency_key = 'moderation-idempotency-stale'
  ),
  'provider_result_unknown',
  'an unknown remote result is explicit instead of silently retried'
);

select lives_ok(
  $$
    select *
    from public.create_moderation_request_with_evidence(
      '88888888-8888-4888-8888-888888888888',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '77777777-7777-4777-8777-777777777777',
      'delete',
      'pending_confirmation',
      'moderation-idempotency-delete',
      '{"source":{"youtubeCommentId":"youtube-comment-1"},"analysis":{}}',
      '12121212-1212-4212-8212-121212121212',
      'creator-channel',
      '2026-07-24T09:00:00.000Z'
    )
  $$,
  'a delete request can be snapshotted before confirmation'
);

select ok(
  not public.claim_moderation_request(
    '88888888-8888-4888-8888-888888888888',
    (
      select id
      from public.moderation_action_requests
      where idempotency_key = 'moderation-idempotency-delete'
    ),
    '77777777-7777-4777-8777-777777777777',
    now()
  ),
  'delete eligibility is rechecked atomically when the request is claimed'
);

select lives_ok(
  $$
    select *
    from public.create_moderation_request_with_evidence(
      '88888888-8888-4888-8888-888888888888',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '77777777-7777-4777-8777-777777777777',
      'reject',
      'awaiting_scope',
      'moderation-idempotency-scope',
      '{"source":{"youtubeCommentId":"youtube-comment-1"},"analysis":{}}',
      '12121212-1212-4212-8212-121212121212',
      'creator-channel',
      '2026-07-24T09:00:00.000Z'
    )
  $$,
  'a scope-pending request is bound to the current connection version'
);

select ok(
  public.complete_moderation_scope_grant(
    '88888888-8888-4888-8888-888888888888',
    (
      select id
      from public.moderation_action_requests
      where idempotency_key = 'moderation-idempotency-scope'
    ),
    '77777777-7777-4777-8777-777777777777',
    '12121212-1212-4212-8212-121212121212',
    'creator-channel',
    '2026-07-24T09:00:00.000Z',
    '2026-07-24T09:30:00.000Z',
    'encrypted-access',
    'encrypted-refresh',
    '2026-07-24T10:30:00.000Z',
    array[
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.force-ssl'
    ],
    null
  ),
  'scope grant storage and request resumption succeed in one transaction'
);

select is(
  (
    select mar.state::text || ':' || yc.updated_at::text
    from public.moderation_action_requests mar
    join public.youtube_connections yc
      on yc.id = mar.youtube_connection_id
    where mar.idempotency_key = 'moderation-idempotency-scope'
      and mar.connection_updated_at = yc.updated_at
  ),
  'pending_confirmation:2026-07-24 09:30:00+00',
  'the request and connection expose the same new version after the grant'
);

select * from finish();

rollback;
