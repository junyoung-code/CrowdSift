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
values
  (
    'c1000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'crowdsift-default@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    'c1000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'crowdsift-custom@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

insert into public.workspaces (id, owner_user_id)
values (
  'c2000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001'
);

insert into public.workspaces (id, owner_user_id, name)
values (
  'c2000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000002',
  '친구와 함께 쓰는 공간'
);

select plan(2);

select is(
  (
    select name
    from public.workspaces
    where id = 'c2000000-0000-0000-0000-000000000001'
  ),
  '내 CrowdSift',
  'new workspaces use the CrowdSift default name'
);

select is(
  (
    select name
    from public.workspaces
    where id = 'c2000000-0000-0000-0000-000000000002'
  ),
  '친구와 함께 쓰는 공간',
  'custom workspace names remain unchanged'
);

select * from finish();

rollback;
