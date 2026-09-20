-- A worker can be terminated after its third claim and before it records failure.
-- Retire that expired active run before the claimant creates another run, so the
-- one-active-run constraint remains a safety boundary instead of a permanent jam.
create or replace function public.retire_exhausted_channel_sync_cycles(
  target_workspace_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
declare
  exhausted record;
begin
  for exhausted in
    select
      sync_run.id as run_id,
      sync_run.setting_id,
      sync_run.kind,
      coalesce(
        sync_run.error_code,
        sync_setting.last_error_code,
        'provider_error'
      ) as stable_error_code
    from public.channel_comment_sync_runs as sync_run
    join public.channel_comment_sync_settings as sync_setting
      on sync_setting.id = sync_run.setting_id
    where (target_workspace_id is null
        or sync_setting.workspace_id = target_workspace_id)
      and sync_run.status in ('pending', 'running')
      and sync_run.attempt_count >= 3
      and (sync_setting.lease_until is null
        or sync_setting.lease_until <= now())
    order by sync_run.created_at
    for update of sync_run, sync_setting
  loop
    update public.channel_comment_sync_runs
    set
      status = 'failed',
      error_code = exhausted.stable_error_code,
      finished_at = coalesce(finished_at, now())
    where id = exhausted.run_id;

    update public.comment_import_jobs
    set
      status = 'failed',
      last_error_code = exhausted.stable_error_code,
      finished_at = coalesce(finished_at, now())
    where channel_sync_run_id = exhausted.run_id
      and trigger_kind = 'channel_sync'
      and status = 'running';

    update public.channel_comment_sync_settings
    set
      backfill_status = case
        when exhausted.kind = 'sync_cycle' and backfill_status <> 'completed'
          then 'failed'
        else backfill_status
      end,
      reply_reconciliation_status = case
        when exhausted.kind = 'reply_reconciliation' then 'failed'
        else reply_reconciliation_status
      end,
      lease_until = null,
      last_error_code = exhausted.stable_error_code,
      retry_blocked = true,
      updated_at = now()
    where id = exhausted.setting_id;
  end loop;
end;
$$;

create or replace function public.claim_channel_comment_sync_cycle(
  target_limit integer default 1,
  target_lease_seconds integer default 240
)
returns table (
  setting_id uuid,
  run_id uuid,
  claim_token uuid,
  workspace_id uuid,
  connection_id uuid,
  youtube_channel_id text,
  run_kind text,
  backfill_start_at timestamptz,
  page_token text,
  last_successful_sync_at timestamptz,
  incremental_scan_started_at timestamptz,
  incremental_page_token text,
  backfill_page_token text,
  backfill_status text,
  cycle_budget integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.retire_exhausted_channel_sync_cycles(null);

  return query
  select *
  from public.claim_channel_comment_sync_cycle_internal(
    null,
    target_limit,
    target_lease_seconds
  );
end;
$$;

create or replace function public.claim_channel_comment_sync_cycle_for_workspace(
  target_workspace_id uuid,
  target_requesting_user_id uuid,
  target_lease_seconds integer default 240
)
returns table (
  setting_id uuid,
  run_id uuid,
  claim_token uuid,
  workspace_id uuid,
  connection_id uuid,
  youtube_channel_id text,
  run_kind text,
  backfill_start_at timestamptz,
  page_token text,
  last_successful_sync_at timestamptz,
  incremental_scan_started_at timestamptz,
  incremental_page_token text,
  backfill_page_token text,
  backfill_status text,
  cycle_budget integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_requesting_user_id is null or not exists (
    select 1
    from public.workspace_members as member
    where member.workspace_id = target_workspace_id
      and member.user_id = target_requesting_user_id
  ) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;

  perform public.retire_exhausted_channel_sync_cycles(target_workspace_id);

  return query
  select *
  from public.claim_channel_comment_sync_cycle_internal(
    target_workspace_id,
    1,
    target_lease_seconds
  );
end;
$$;

revoke all on function public.retire_exhausted_channel_sync_cycles(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_channel_comment_sync_cycle(integer, integer)
  from public, anon, authenticated;
revoke all on function public.claim_channel_comment_sync_cycle_for_workspace(
  uuid, uuid, integer
) from public, anon, authenticated;

grant execute on function public.claim_channel_comment_sync_cycle(integer, integer)
  to service_role;
grant execute on function public.claim_channel_comment_sync_cycle_for_workspace(
  uuid, uuid, integer
) to service_role;
