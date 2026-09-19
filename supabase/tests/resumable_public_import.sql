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
  '24242424-2424-4242-8242-242424242424',
  'authenticated',
  'authenticated',
  'public-read-owner@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.workspaces (id, owner_user_id, name)
values (
  '25252525-2525-4252-8252-252525252525',
  '24242424-2424-4242-8242-242424242424',
  'Public read workspace'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  '25252525-2525-4252-8252-252525252525',
  '24242424-2424-4242-8242-242424242424',
  'owner'
);

insert into public.youtube_videos (
  id,
  workspace_id,
  youtube_channel_id,
  youtube_video_id,
  title
)
values (
  '26262626-2626-4262-8262-262626262626',
  '25252525-2525-4252-8252-252525252525',
  'public-channel',
  'dQw4w9WgXcQ',
  'Public test video'
);

select plan(16);
insert into public.comment_import_jobs(id,workspace_id,youtube_video_id,source_kind,requested_total_count,source_video_url)
values('45454545-4545-4545-8545-454545454545','25252525-2525-4252-8252-252525252525','dQw4w9WgXcQ','public_url',0,'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
select ok(public.claim_public_import_job('45454545-4545-4545-8545-454545454545','11111111-1111-4111-8111-111111111111') is not null,'first worker claims the job');
select is(public.claim_public_import_job('45454545-4545-4545-8545-454545454545','22222222-2222-4222-8222-222222222222'),null::jsonb,'parallel worker cannot claim an active lease');
select lives_ok($$select public.commit_public_import_batch('45454545-4545-4545-8545-454545454545','11111111-1111-4111-8111-111111111111',
 '[{"youtubeCommentId":"resume-parent","textDisplay":"first","likeCount":0,"rawPayload":{}}]',
 '{"threadPageToken":"page-2","threadsDone":false,"replies":[],"done":false}',1)$$,'source and cursor commit together');
select is((select count(*)::integer from public.comment_import_items where import_job_id='45454545-4545-4545-8545-454545454545'),1,'first source is durable');
select is((select cursor->>'threadPageToken' from public.public_import_checkpoints where import_job_id='45454545-4545-4545-8545-454545454545'),'page-2','next page is durable');
select throws_ok($$select public.commit_public_import_batch('45454545-4545-4545-8545-454545454545','11111111-1111-4111-8111-111111111111',
 '[{"youtubeCommentId":"rollback-parent","textDisplay":"rollback","likeCount":0,"rawPayload":{}},{"youtubeCommentId":"orphan","parentYoutubeCommentId":"missing","textDisplay":"orphan","likeCount":0,"rawPayload":{}}]',
 '{"done":true}',1)$$,'P0001','public_import_parent_missing','bad page fails atomically');
select is((select count(*)::integer from public.comment_import_items where import_job_id='45454545-4545-4545-8545-454545454545'),1,'failed page does not partially save sources');
select is((select cursor->>'threadPageToken' from public.public_import_checkpoints where import_job_id='45454545-4545-4545-8545-454545454545'),'page-2','failed page does not advance cursor');
update public.public_import_checkpoints set lease_until=now()-interval '1 minute';
select is(public.claim_public_import_job('45454545-4545-4545-8545-454545454545','22222222-2222-4222-8222-222222222222')->>'threadPageToken','page-2','new worker resumes from durable cursor after crash');
select throws_ok($$select public.commit_public_import_batch('45454545-4545-4545-8545-454545454545','11111111-1111-4111-8111-111111111111','[]','{"done":true}',0)$$,'40001','public_import_lease_lost','stale worker cannot overwrite resumed progress');
select lives_ok($$select public.commit_public_import_batch('45454545-4545-4545-8545-454545454545','22222222-2222-4222-8222-222222222222',
 '[{"youtubeCommentId":"resume-parent","textDisplay":"first","likeCount":0,"rawPayload":{}},{"youtubeCommentId":"resume-reply","parentYoutubeCommentId":"resume-parent","textDisplay":"reply","likeCount":0,"rawPayload":{}}]',
 '{"threadPageToken":null,"threadsDone":true,"replies":[],"done":true}',1)$$,'resumed page saves only unseen sources');
select is((select stored_count from public.comment_import_jobs where id='45454545-4545-4545-8545-454545454545'),2,'replaying existing source does not inflate saved count');
insert into public.analysis_jobs(id,workspace_id,import_job_id,configuration_key,total_count)
values('56565656-5656-4656-8656-565656565656','25252525-2525-4252-8252-252525252525','45454545-4545-4545-8545-454545454545','test-resume',2);
insert into public.analysis_job_items(analysis_job_id,workspace_id,raw_comment_id,status,attempt_count,finished_at,error_code)
select '56565656-5656-4656-8656-565656565656',workspace_id,id,
 case when youtube_comment_id='resume-parent' then 'succeeded'::public.item_status else 'failed'::public.item_status end,1,now(),'classification_failed'
from public.raw_comments where first_import_job_id='45454545-4545-4545-8545-454545454545';
select is(public.retry_failed_classification_items('56565656-5656-4656-8656-565656565656'),1,'retry selects only failed item');
select is((select count(*)::integer from public.analysis_job_items where analysis_job_id='56565656-5656-4656-8656-565656565656' and status='succeeded' and attempt_count=1 and finished_at is not null),1,'completed item is unchanged');
select is((select count(*)::integer from public.audit_logs where event_type='classification.retry_requested' and metadata->>'analysisJobId'='56565656-5656-4656-8656-565656565656'),1,'retry preserves previous failure in audit log');
set local role authenticated;
select throws_ok($$select public.claim_public_import_job('45454545-4545-4545-8545-454545454545','11111111-1111-4111-8111-111111111111')$$,'42501',null,'browser role cannot bypass server workspace authorization');
reset role;
select * from finish();
rollback;
