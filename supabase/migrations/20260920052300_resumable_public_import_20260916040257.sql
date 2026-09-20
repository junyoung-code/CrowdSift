begin;
-- Contains only collection cursor/lease; source content stays in source tables.
create table public.public_import_checkpoints (
  import_job_id uuid primary key references public.comment_import_jobs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  cursor jsonb not null default '{"threadPageToken":null,"threadsDone":false,"replies":[],"done":false}',
  claim_token uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.public_import_checkpoints enable row level security;
revoke all on public.public_import_checkpoints from public, anon, authenticated;
grant all on public.public_import_checkpoints to service_role;

create function public.claim_public_import_job(target_job_id uuid, target_token uuid)
returns jsonb language plpgsql set search_path = public as $$
declare j public.comment_import_jobs; c public.public_import_checkpoints;
begin
  select * into strict j from public.comment_import_jobs where id=target_job_id and source_kind='public_url' for update;
  insert into public.public_import_checkpoints(import_job_id,workspace_id,cursor)
  values(j.id,j.workspace_id,jsonb_build_object('threadPageToken',null,'threadsDone',false,'replies','[]'::jsonb,'done',j.status='succeeded'))
  on conflict do nothing;
  select * into strict c from public.public_import_checkpoints where import_job_id=j.id for update;
  if c.lease_until > now() then return null; end if;
  update public.public_import_checkpoints set claim_token=target_token,lease_until=now()+interval '5 minutes',updated_at=now() where import_job_id=j.id;
  if not (c.cursor->>'done')::boolean then
    update public.comment_import_jobs set status='running',started_at=coalesce(started_at,now()),finished_at=null,last_error_code=null where id=j.id;
  end if;
  return c.cursor;
end $$;

-- Sources, counters and cursor advance in ONE transaction. A crash replays only the uncommitted page.
create function public.commit_public_import_batch(target_job_id uuid, target_token uuid, target_comments jsonb, target_cursor jsonb, target_quota integer)
returns jsonb language plpgsql set search_path=public as $$
declare j public.comment_import_jobs; c public.public_import_checkpoints; v jsonb; result record;
  observed integer; new_count integer:=0; duplicate_count_delta integer:=0; top_count integer:=0; reply_count_delta integer:=0; next_cursor jsonb:=target_cursor;
begin
  select * into strict j from public.comment_import_jobs where id=target_job_id and source_kind='public_url' for update;
  select * into strict c from public.public_import_checkpoints where import_job_id=j.id for update;
  if c.claim_token is distinct from target_token or c.lease_until < now() then raise exception 'public_import_lease_lost' using errcode='40001'; end if;
  if jsonb_typeof(target_comments)<>'array' or jsonb_array_length(target_comments)>10000 or target_quota<0 then raise exception 'invalid import batch'; end if;
  select count(*) into observed from public.comment_import_items where import_job_id=j.id and status='succeeded';
  for v in select value from jsonb_array_elements(target_comments) loop
    if j.requested_total_count>0 and observed>=j.requested_total_count then exit; end if;
    if exists(select 1 from public.comment_import_items where import_job_id=j.id and youtube_comment_id=v->>'youtubeCommentId' and status='succeeded') then continue; end if;
    -- Reply pagination may overlap inline replies, but may never orphan a reply.
    if v->>'parentYoutubeCommentId' is not null and not exists(select 1 from public.comment_import_items where import_job_id=j.id and youtube_comment_id=v->>'parentYoutubeCommentId' and status='succeeded') then raise exception 'public_import_parent_missing'; end if;
    select * into result from public.store_import_comment_item(j.id,j.workspace_id,j.youtube_video_id,
      v->>'youtubeCommentId',v->>'parentYoutubeCommentId',v->>'authorChannelId',v->>'authorDisplayName',v->>'authorAvatarUrl',
      v->>'textDisplay',v->>'textOriginal',(v->>'likeCount')::integer,v->>'sourceModerationStatus',
      (v->>'publishedAt')::timestamptz,(v->>'updatedAt')::timestamptz,v->'rawPayload');
    observed:=observed+1;
    if result.disposition='stored' then new_count:=new_count+1; else duplicate_count_delta:=duplicate_count_delta+1; end if;
    if v->>'parentYoutubeCommentId' is null then top_count:=top_count+1; else reply_count_delta:=reply_count_delta+1; end if;
  end loop;
  if j.requested_total_count>0 and observed>=j.requested_total_count then next_cursor:=jsonb_set(next_cursor,'{done}','true'); end if;
  update public.comment_import_jobs set fetched_count=observed,stored_count=stored_count+new_count,
    duplicate_count=duplicate_count+duplicate_count_delta,top_level_count=top_level_count+top_count,reply_count=reply_count+reply_count_delta,
    failed_count=0,last_error_code=null,youtube_quota_units_used=youtube_quota_units_used+target_quota,
    status=case when (next_cursor->>'done')::boolean then 'succeeded'::public.job_status else 'running'::public.job_status end,
    finished_at=case when (next_cursor->>'done')::boolean then now() else null end
    where id=j.id;
  update public.public_import_checkpoints set cursor=next_cursor,updated_at=now(),lease_until=now()+interval '5 minutes' where import_job_id=j.id;
  insert into public.audit_logs(workspace_id,event_type,target_type,target_id,metadata)
    values(j.workspace_id,'public_import.page_saved','comment_import_job',j.id::text,jsonb_build_object('observed',observed,'new',new_count,'duplicate',duplicate_count_delta,'done',next_cursor->'done'));
  return next_cursor;
end $$;

-- Serialize retry with the job row. Completed items and their stage results remain untouched.
create function public.retry_failed_classification_items(target_job_id uuid)
returns integer language plpgsql set search_path=public as $$
declare w uuid; retried integer;
begin
  select workspace_id into strict w from public.analysis_jobs where id=target_job_id for update;
  insert into public.audit_logs(workspace_id,event_type,target_type,target_id,metadata)
    select w,'classification.retry_requested','analysis_job_item',id::text,
      jsonb_build_object('analysisJobId',target_job_id,'previousErrorCode',error_code,'previousAttempts',attempt_count)
    from public.analysis_job_items where analysis_job_id=target_job_id and status='failed';
  update public.analysis_job_items set status='pending',attempt_count=0,error_code=null,started_at=null,finished_at=null
    where analysis_job_id=target_job_id and status='failed';
  get diagnostics retried=row_count;
  if retried>0 then update public.analysis_jobs set status='running',finished_at=null,failed_count=0 where id=target_job_id; end if;
  return retried;
end $$;

revoke all on function public.claim_public_import_job(uuid,uuid) from public,anon,authenticated;
revoke all on function public.commit_public_import_batch(uuid,uuid,jsonb,jsonb,integer) from public,anon,authenticated;
revoke all on function public.retry_failed_classification_items(uuid) from public,anon,authenticated;
grant execute on function public.claim_public_import_job(uuid,uuid),public.commit_public_import_batch(uuid,uuid,jsonb,jsonb,integer),public.retry_failed_classification_items(uuid) to service_role;
commit;
