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
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'authenticated',
  'authenticated',
  'policy-owner@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.workspaces (id, owner_user_id, name)
values (
  '99999999-9999-9999-9999-999999999999',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'Policy workspace'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  '99999999-9999-9999-9999-999999999999',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'owner'
);

select plan(4);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$
    select policy_version
    from public.create_creator_policy_version(
      '99999999-9999-9999-9999-999999999999',
      '{"level":"standard"}'::jsonb,
      '{"caution":"review","risk":"hold_for_review"}'::jsonb,
      true,
      '[{"kind":"blocked","phrase":"광고","normalizedPhrase":"광고","contextNote":null}]'::jsonb
    )
  $$,
  $$ values (1) $$,
  'the first policy starts at version one'
);

select results_eq(
  $$
    select policy_version
    from public.create_creator_policy_version(
      '99999999-9999-9999-9999-999999999999',
      '{"level":"high"}'::jsonb,
      '{"caution":"review","risk":"hold_for_review"}'::jsonb,
      true,
      '[{"kind":"blocked","phrase":"사기","normalizedPhrase":"사기","contextNote":null}]'::jsonb
    )
  $$,
  $$ values (2) $$,
  'saving again creates a second policy version'
);

select results_eq(
  $$
    select version
    from public.creator_policies
    where workspace_id = '99999999-9999-9999-9999-999999999999'
    order by version
  $$,
  $$ values (1), (2) $$,
  'both immutable policy versions remain available'
);

select results_eq(
  $$
    select phrase
    from public.phrase_rules
    where workspace_id = '99999999-9999-9999-9999-999999999999'
    order by version
  $$,
  $$ values ('광고'::text), ('사기'::text) $$,
  'each policy version keeps its own phrase rules'
);

select * from finish();

rollback;
