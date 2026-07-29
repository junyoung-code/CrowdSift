alter table public.workspaces
  alter column name set default '내 CrowdSift';

update public.workspaces
set name = '내 CrowdSift'
where name = '내 CommentHawk';
