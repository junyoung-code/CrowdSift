-- Reused replacement jobs must be scheduled when unfinished items are added.
create or replace function public.supersede_legacy_classification_job(target_job_id uuid, new_configuration_key text, new_execution_config jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare old_job public.analysis_jobs; replacement uuid;
begin
  select * into old_job from public.analysis_jobs where id=target_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if old_job.replacement_job_id is not null then return old_job.replacement_job_id; end if;
  if old_job.configuration_key like 'semantic-v1:%' then return old_job.id; end if;
  if new_configuration_key not like 'semantic-v1:%' then raise exception 'invalid_configuration'; end if;
  insert into public.analysis_jobs(workspace_id,import_job_id,configuration_key,execution_config)
  values(old_job.workspace_id,old_job.import_job_id,new_configuration_key,new_execution_config)
  on conflict (import_job_id,configuration_key) do update set configuration_key=excluded.configuration_key, status='pending', finished_at=null
  returning id into replacement;
  insert into public.analysis_job_items(analysis_job_id,workspace_id,raw_comment_id)
  select replacement,workspace_id,raw_comment_id from public.analysis_job_items
  where analysis_job_id=old_job.id and status <> 'succeeded'
  on conflict (analysis_job_id,raw_comment_id) do nothing;
  update public.analysis_jobs set total_count=(select count(*) from public.analysis_job_items where analysis_job_id=replacement) where id=replacement;
  update public.analysis_jobs set replacement_job_id=replacement, status=case when completed_count>0 then 'partially_succeeded'::public.job_status else 'failed'::public.job_status end, finished_at=now() where id=old_job.id;
  insert into public.audit_logs(workspace_id,event_type,target_type,target_id,metadata)
  values(old_job.workspace_id,'classification.pipeline_replaced','analysis_job',old_job.id,jsonb_build_object('replacementJobId',replacement));
  return replacement;
end $$;
revoke all on function public.supersede_legacy_classification_job(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.supersede_legacy_classification_job(uuid,text,jsonb) to service_role;
