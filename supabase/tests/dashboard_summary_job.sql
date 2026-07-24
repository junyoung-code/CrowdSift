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
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'authenticated',
  'authenticated',
  'summary-job-owner@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.workspaces (id, owner_user_id, name)
values (
  '55555555-5555-4555-8555-555555555555',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'Summary job workspace'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  '55555555-5555-4555-8555-555555555555',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'owner'
);

insert into public.analysis_jobs (
  id,
  workspace_id,
  configuration_key,
  status,
  total_count,
  completed_count,
  finished_at
)
values (
  '66666666-6666-4666-8666-666666666666',
  '55555555-5555-4555-8555-555555555555',
  'summary-job-test',
  'succeeded',
  10,
  10,
  now()
);

select plan(8);

select has_table(
  'public',
  'workspace_analysis_summary_jobs',
  'dashboard summary retries have a durable job table'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (
    select retry.analysis_job_id
    from public.get_retryable_dashboard_summary_jobs(5) retry
    limit 1
  ),
  '66666666-6666-4666-8666-666666666666'::uuid,
  'the worker scanner finds a completed analysis job before its first claim'
);

select is(
  (
    select claim.attempt_count
    from public.claim_dashboard_summary_job(
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666',
      3
    ) claim
  ),
  1,
  'the first worker atomically claims attempt one'
);

select is(
  (
    select state
    from public.workspace_analysis_summary_jobs
    where analysis_job_id = '66666666-6666-4666-8666-666666666666'
  ),
  'running',
  'the claimed attempt is durably marked running'
);

update public.workspace_analysis_summary_jobs
set state = 'failed', last_error_code = 'dashboard_summary_failed'
where analysis_job_id = '66666666-6666-4666-8666-666666666666';

select is(
  (
    select claim.attempt_count
    from public.claim_dashboard_summary_job(
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666',
      3
    ) claim
  ),
  2,
  'a failed durable attempt can be claimed again'
);

update public.workspace_analysis_summary_jobs
set state = 'failed', last_error_code = 'dashboard_summary_failed'
where analysis_job_id = '66666666-6666-4666-8666-666666666666';

select is(
  (
    select claim.attempt_count
    from public.claim_dashboard_summary_job(
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666',
      3
    ) claim
  ),
  3,
  'the bounded final attempt can be claimed'
);

update public.workspace_analysis_summary_jobs
set state = 'failed', last_error_code = 'dashboard_summary_failed'
where analysis_job_id = '66666666-6666-4666-8666-666666666666';

select is_empty(
  $$
    select *
    from public.claim_dashboard_summary_job(
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666',
      3
    )
  $$,
  'a summary job cannot exceed the bounded attempt count'
);

select is_empty(
  $$
    select *
    from public.get_retryable_dashboard_summary_jobs(5)
  $$,
  'the worker scanner excludes an exhausted summary job'
);

select * from finish();

rollback;
