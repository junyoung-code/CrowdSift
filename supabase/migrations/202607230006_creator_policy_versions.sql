create or replace function public.create_creator_policy_version(
  target_workspace_id uuid,
  target_category_sensitivity jsonb,
  target_preferred_actions jsonb,
  target_harmful_text_hidden boolean,
  target_phrase_rules jsonb
)
returns table (
  policy_id uuid,
  policy_version integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  inserted_policy_id uuid;
  next_version integer;
  rule_value jsonb;
  rule_kind_value public.rule_kind;
  rule_phrase text;
  rule_normalized_phrase text;
  rule_context_note text;
begin
  if actor_user_id is null
    or not public.is_workspace_member(target_workspace_id)
  then
    raise exception 'workspace membership required' using errcode = '42501';
  end if;

  if jsonb_typeof(target_phrase_rules) <> 'array' then
    raise exception 'phrase rules must be an array' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(target_workspace_id::text, 0)
  );

  select coalesce(max(cp.version), 0) + 1
  into next_version
  from public.creator_policies cp
  where cp.workspace_id = target_workspace_id;

  insert into public.creator_policies (
    workspace_id,
    version,
    category_sensitivity,
    preferred_actions,
    harmful_text_hidden,
    created_by
  )
  values (
    target_workspace_id,
    next_version,
    coalesce(target_category_sensitivity, '{}'::jsonb),
    coalesce(target_preferred_actions, '{}'::jsonb),
    target_harmful_text_hidden,
    actor_user_id
  )
  returning id into inserted_policy_id;

  for rule_value in
    select value from jsonb_array_elements(target_phrase_rules)
  loop
    rule_kind_value := (rule_value ->> 'kind')::public.rule_kind;
    rule_phrase := trim(rule_value ->> 'phrase');
    rule_normalized_phrase := trim(rule_value ->> 'normalizedPhrase');
    rule_context_note := nullif(trim(rule_value ->> 'contextNote'), '');

    if coalesce(rule_phrase, '') = ''
      or coalesce(rule_normalized_phrase, '') = ''
    then
      raise exception 'policy phrase cannot be empty' using errcode = '22023';
    end if;

    insert into public.phrase_rules (
      workspace_id,
      policy_id,
      kind,
      phrase,
      normalized_phrase,
      context_note,
      enabled,
      version
    )
    values (
      target_workspace_id,
      inserted_policy_id,
      rule_kind_value,
      rule_phrase,
      rule_normalized_phrase,
      rule_context_note,
      true,
      next_version
    );
  end loop;

  return query
  select inserted_policy_id, next_version;
end;
$$;

revoke all on function public.create_creator_policy_version(
  uuid,
  jsonb,
  jsonb,
  boolean,
  jsonb
) from public, anon;

grant execute on function public.create_creator_policy_version(
  uuid,
  jsonb,
  jsonb,
  boolean,
  jsonb
) to authenticated;
