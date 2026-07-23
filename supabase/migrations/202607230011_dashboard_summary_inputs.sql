create function public.get_dashboard_summary_inputs(
  target_analysis_job_id uuid
)
returns table (
  workspace_id uuid,
  job_status public.job_status,
  analysis_count integer,
  safe_count integer,
  caution_count integer,
  risk_count integer,
  sanitized_signals jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with target_job as (
    select aj.id, aj.workspace_id, aj.status
    from public.analysis_jobs aj
    where aj.id = target_analysis_job_id
  ),
  final_analyses as (
    select distinct on (ca.raw_comment_id)
      ca.id,
      ca.raw_comment_id,
      ca.review_level,
      ca.created_at
    from public.comment_analyses ca
    join public.analysis_job_items aji
      on aji.id = ca.analysis_job_item_id
    join target_job tj
      on tj.id = aji.analysis_job_id
      and tj.workspace_id = ca.workspace_id
    order by
      ca.raw_comment_id,
      ca.stage desc,
      ca.created_at desc,
      ca.id desc
  ),
  analysis_counts as (
    select
      count(*)::integer as total,
      count(*) filter (where fa.review_level = 'safe')::integer as safe,
      count(*) filter (where fa.review_level = 'caution')::integer as caution,
      count(*) filter (where fa.review_level = 'risk')::integer as risk
    from final_analyses fa
  ),
  signal_values as (
    select sf.neutral_text
    from final_analyses fa
    join public.sanitized_feedback sf
      on sf.analysis_id = fa.id
    where sf.neutral_text is not null
      and length(trim(sf.neutral_text)) > 0
    order by fa.created_at desc
    limit 20
  )
  select
    tj.workspace_id,
    tj.status,
    ac.total,
    ac.safe,
    ac.caution,
    ac.risk,
    coalesce(
      (select jsonb_agg(sv.neutral_text) from signal_values sv),
      '[]'::jsonb
    )
  from target_job tj
  cross join analysis_counts ac;
$$;

revoke all on function public.get_dashboard_summary_inputs(uuid) from public;

grant execute on function public.get_dashboard_summary_inputs(uuid)
  to service_role;
