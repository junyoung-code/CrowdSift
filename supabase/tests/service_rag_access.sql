begin;

create extension if not exists pgtap with schema extensions;

select plan(1);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$
    select *
    from public.match_creator_feedback(
      '11111111-1111-1111-1111-111111111111',
      array_fill(0::real, array[1536])::vector,
      0.78,
      5
    )
  $$,
  'server-side RAG can search the explicitly scoped workspace'
);

select * from finish();

rollback;
