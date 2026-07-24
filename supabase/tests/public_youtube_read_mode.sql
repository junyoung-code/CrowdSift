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
  '24242424-2424-4242-8242-242424242424',
  'authenticated',
  'authenticated',
  'public-read-owner@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.workspaces (id, owner_user_id, name)
values (
  '25252525-2525-4252-8252-252525252525',
  '24242424-2424-4242-8242-242424242424',
  'Public read workspace'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  '25252525-2525-4252-8252-252525252525',
  '24242424-2424-4242-8242-242424242424',
  'owner'
);

insert into public.youtube_videos (
  id,
  workspace_id,
  youtube_channel_id,
  youtube_video_id,
  title
)
values (
  '26262626-2626-4262-8262-262626262626',
  '25252525-2525-4252-8252-252525252525',
  'public-channel',
  'dQw4w9WgXcQ',
  'Public test video'
);

select plan(17);

insert into public.comment_import_jobs (
  id,
  workspace_id,
  youtube_video_id,
  requested_top_level_count
)
values (
  '27272727-2727-4272-8272-272727272727',
  '25252525-2525-4252-8252-252525252525',
  'dQw4w9WgXcQ',
  20
);

select is(
  (
    select source_kind::text
    from public.comment_import_jobs
    where id = '27272727-2727-4272-8272-272727272727'
  ),
  'owned_oauth',
  'existing and owned jobs default to the OAuth source'
);

select lives_ok(
  $$
    insert into public.comment_import_jobs (
      id,
      workspace_id,
      youtube_video_id,
      requested_top_level_count,
      requested_total_count,
      source_kind,
      source_video_url
    )
    values (
      '28282828-2828-4282-8282-282828282828',
      '25252525-2525-4252-8252-252525252525',
      'dQw4w9WgXcQ',
      null,
      20,
      'public_url',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    )
  $$,
  'a canonical public URL job with an approved total count is accepted'
);

select throws_ok(
  $$
    insert into public.comment_import_jobs (
      workspace_id,
      youtube_video_id,
      requested_total_count,
      source_kind,
      source_video_url
    )
    values (
      '25252525-2525-4252-8252-252525252525',
      'dQw4w9WgXcQ',
      21,
      'public_url',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    )
  $$,
  '23514',
  null,
  'an unsupported public total count is rejected'
);

select throws_ok(
  $$
    insert into public.comment_import_jobs (
      workspace_id,
      youtube_video_id,
      requested_total_count,
      source_kind,
      source_video_url
    )
    values (
      '25252525-2525-4252-8252-252525252525',
      'dQw4w9WgXcQ',
      20,
      'public_url',
      'https://example.com/watch?v=dQw4w9WgXcQ'
    )
  $$,
  '23514',
  null,
  'a non-canonical public source URL is rejected'
);

insert into public.comment_import_items (
  import_job_id,
  workspace_id,
  youtube_comment_id,
  status
)
select
  '28282828-2828-4282-8282-282828282828',
  '25252525-2525-4252-8252-252525252525',
  'public-comment-' || value,
  'pending'
from generate_series(1, 20) as value;

select is(
  (
    select count(*)::integer
    from public.comment_import_items
    where import_job_id = '28282828-2828-4282-8282-282828282828'
  ),
  20,
  'the total cap counts all items observed by the public job'
);

select throws_ok(
  $$
    insert into public.comment_import_items (
      import_job_id,
      workspace_id,
      youtube_comment_id,
      status
    )
    values (
      '28282828-2828-4282-8282-282828282828',
      '25252525-2525-4252-8252-252525252525',
      'public-comment-21',
      'pending'
    )
  $$,
  'P0001',
  'public import item limit exceeded',
  'a public job cannot observe more items than requested'
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
  '29292929-2929-4292-8292-292929292929',
  '25252525-2525-4252-8252-252525252525',
  'dQw4w9WgXcQ',
  'public-comment-1',
  '보존할 공개 댓글',
  '28282828-2828-4282-8282-282828282828'
);

update public.comment_import_items
set
  raw_comment_id = '29292929-2929-4292-8292-292929292929',
  status = 'succeeded'
where import_job_id = '28282828-2828-4282-8282-282828282828'
  and youtube_comment_id = 'public-comment-1';

insert into public.raw_comments (
  id,
  workspace_id,
  youtube_video_id,
  youtube_comment_id,
  text_display,
  first_import_job_id
)
values (
  '31313131-3131-4313-8313-313131313131',
  '25252525-2525-4252-8252-252525252525',
  'dQw4w9WgXcQ',
  'owned-comment-1',
  '소유 채널에서 가져온 댓글',
  '27272727-2727-4272-8272-272727272727'
);

insert into public.comment_import_items (
  import_job_id,
  workspace_id,
  youtube_comment_id,
  raw_comment_id,
  status
)
values (
  '27272727-2727-4272-8272-272727272727',
  '25252525-2525-4252-8252-252525252525',
  'owned-comment-1',
  '31313131-3131-4313-8313-313131313131',
  'succeeded'
);

insert into public.analysis_jobs (
  id,
  workspace_id,
  import_job_id,
  configuration_key
)
values (
  '30303030-3030-4303-8303-303030303030',
  '25252525-2525-4252-8252-252525252525',
  '28282828-2828-4282-8282-282828282828',
  'public-cost-test'
);

select lives_ok(
  $$
    insert into public.analysis_job_costs (
      analysis_job_id,
      workspace_id,
      pricing_version,
      pricing_effective_at,
      currency,
      stage_one_model,
      stage_two_model,
      embedding_model,
      stage_one_input_per_million,
      stage_one_output_per_million,
      stage_two_input_per_million,
      stage_two_output_per_million,
      embedding_input_per_million,
      estimated_cost_low,
      estimated_cost_high
    )
    values (
      '30303030-3030-4303-8303-303030303030',
      '25252525-2525-4252-8252-252525252525',
      'openai-2026-07-24',
      '2026-07-24T00:00:00Z',
      'USD',
      'gpt-5.4-nano',
      'gpt-5.4-mini',
      'text-embedding-3-small',
      0.20,
      1.25,
      0.75,
      4.50,
      0.02,
      0.01,
      0.03
    )
  $$,
  'an analysis job stores a reproducible pricing snapshot'
);

select throws_ok(
  $$
    insert into public.analysis_job_costs (
      analysis_job_id,
      workspace_id,
      pricing_version,
      pricing_effective_at,
      currency,
      stage_one_model,
      stage_two_model,
      embedding_model,
      stage_one_input_per_million,
      stage_one_output_per_million,
      stage_two_input_per_million,
      stage_two_output_per_million,
      embedding_input_per_million,
      estimated_cost_low,
      estimated_cost_high
    )
    values (
      '30303030-3030-4303-8303-303030303030',
      '25252525-2525-4252-8252-252525252525',
      'openai-2026-07-24',
      '2026-07-24T00:00:00Z',
      'USD',
      'gpt-5.4-nano',
      'gpt-5.4-mini',
      'text-embedding-3-small',
      0.20,
      1.25,
      0.75,
      4.50,
      0.02,
      0.01,
      0.03
    )
  $$,
  '23505',
  null,
  'a pricing version is idempotent per analysis job'
);

select is(
  (
    select count(*)::integer
    from public.analysis_job_costs
    where analysis_job_id = '30303030-3030-4303-8303-303030303030'
  ),
  1,
  'one pricing snapshot remains after a duplicate attempt'
);

select lives_ok(
  $$
    update public.comment_import_jobs
    set
      youtube_quota_units_used = 3,
      top_level_count = 12,
      reply_count = 8
    where id = '28282828-2828-4282-8282-282828282828'
  $$,
  'public import observations preserve quota and parent/reply counts'
);

select results_eq(
  $$
    select
      youtube_quota_units_used,
      top_level_count,
      reply_count
    from public.comment_import_jobs
    where id = '28282828-2828-4282-8282-282828282828'
  $$,
  $$ values (3, 12, 8) $$,
  'quota and parent/reply counts are readable'
);

select throws_ok(
  $$
    insert into public.creator_feedback (
      workspace_id,
      raw_comment_id,
      analysis_id,
      source_import_job_id,
      actor_user_id,
      decision,
      use_for_personalization
    )
    values (
      '25252525-2525-4252-8252-252525252525',
      '29292929-2929-4292-8292-292929292929',
      '32323232-3232-4323-8323-323232323232',
      '28282828-2828-4282-8282-282828282828',
      '24242424-2424-4242-8242-242424242424',
      'approved',
      true
    )
  $$,
  '42501',
  'public source feedback cannot enable personalization or training',
  'public feedback cannot opt into personalization'
);

select throws_ok(
  $$
    insert into public.creator_feedback (
      workspace_id,
      raw_comment_id,
      analysis_id,
      source_import_job_id,
      actor_user_id,
      decision,
      use_for_training
    )
    values (
      '25252525-2525-4252-8252-252525252525',
      '29292929-2929-4292-8292-292929292929',
      '32323232-3232-4323-8323-323232323232',
      '28282828-2828-4282-8282-282828282828',
      '24242424-2424-4242-8242-242424242424',
      'approved',
      true
    )
  $$,
  '42501',
  'public source feedback cannot enable personalization or training',
  'public feedback cannot opt into training'
);

select throws_ok(
  $$
    insert into public.moderation_action_requests (
      workspace_id,
      raw_comment_id,
      source_import_job_id,
      requested_by,
      action,
      idempotency_key,
      state
    )
    values (
      '25252525-2525-4252-8252-252525252525',
      '29292929-2929-4292-8292-292929292929',
      '28282828-2828-4282-8282-282828282828',
      '24242424-2424-4242-8242-242424242424',
      'reject',
      'public-moderation-rejected',
      'pending_confirmation'
    )
  $$,
  '42501',
  'public source comments are read-only',
  'public comments cannot create moderation requests'
);

select throws_ok(
  $$
    insert into public.creator_feedback (
      workspace_id,
      raw_comment_id,
      analysis_id,
      source_import_job_id,
      actor_user_id,
      decision
    )
    values (
      '25252525-2525-4252-8252-252525252525',
      '31313131-3131-4313-8313-313131313131',
      '32323232-3232-4323-8323-323232323232',
      '28282828-2828-4282-8282-282828282828',
      '24242424-2424-4242-8242-242424242424',
      'approved'
    )
  $$,
  '42501',
  'feedback source observation mismatch',
  'a caller cannot swap the raw comment for another observation'
);

select lives_ok(
  $$
    insert into public.moderation_action_requests (
      workspace_id,
      raw_comment_id,
      source_import_job_id,
      requested_by,
      action,
      idempotency_key,
      state
    )
    values (
      '25252525-2525-4252-8252-252525252525',
      '31313131-3131-4313-8313-313131313131',
      '27272727-2727-4272-8272-272727272727',
      '24242424-2424-4242-8242-242424242424',
      'reject',
      'owned-moderation-accepted',
      'pending_confirmation'
    )
  $$,
  'owned observations retain the existing moderation path'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '24242424-2424-4242-8242-242424242424',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)::integer
    from public.analysis_job_costs
    where workspace_id = '25252525-2525-4252-8252-252525252525'
  ),
  1,
  'workspace members can read their analysis cost snapshot'
);

select * from finish();

rollback;
