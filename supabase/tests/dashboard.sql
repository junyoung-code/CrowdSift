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
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'authenticated',
  'authenticated',
  'dashboard-owner@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.workspaces (id, owner_user_id, name)
values (
  '44444444-4444-4444-4444-444444444444',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Dashboard workspace'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  '44444444-4444-4444-4444-444444444444',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'owner'
);

select plan(3);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  true
);
select set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);

select ok(
  (
    select to_jsonb(summary) ?& array[
      'priority_comments',
      'recent_corrections',
      'recent_actions'
    ]
    from public.get_dashboard_summary(
      '44444444-4444-4444-4444-444444444444'
    ) summary
  ),
  'dashboard read model includes priority comments, corrections, and actions'
);

select is(
  (
    select jsonb_array_length(to_jsonb(summary) -> 'priority_comments')
    from public.get_dashboard_summary(
      '44444444-4444-4444-4444-444444444444'
    ) summary
  ),
  0,
  'dashboard read model returns an empty priority list without fake data'
);

select has_function(
  'public',
  'get_dashboard_summary_inputs',
  array['uuid'],
  'service-only dashboard summary inputs are available after analysis'
);

select * from finish();

rollback;
