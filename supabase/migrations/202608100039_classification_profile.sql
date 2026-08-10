-- 채널마다 칭찬하는 말도 예민한 주제도 다르다. 지금까지는 그 자리가 코드 안의
-- 기본값 하나뿐이어서, 어느 채널에서나 같은 판단이 나왔다.
--
-- 기존 creator_policies 는 옛 분석 파이프라인의 운영 기준이라 여기에 얹지 않는다.

create table public.classification_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique
    references public.workspaces(id) on delete cascade,
  protection_level text not null default 'standard'
    check (protection_level in ('low', 'standard', 'high')),
  -- 이 채널에서 칭찬으로 쓰이는 말. 비어 있으면 감탄 비속어가 전부 주의로 간다.
  allowed_slang text[] not null default '{}',
  -- 등급을 올리지 않는다. 한 번 더 확인하게 할 뿐이다.
  sensitive_topics text[] not null default '{}',
  hide_personal_attacks boolean not null default true,
  rewrite_tone text not null default 'friendly'
    check (rewrite_tone in ('neutral', 'friendly', 'soft_disappointment')),
  emoji_frequency text not null default 'low'
    check (emoji_frequency in ('none', 'low', 'medium')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  -- 스키마가 받는 한도와 같게 둔다. 넘치면 프롬프트가 길어지기만 한다.
  check (array_length(allowed_slang, 1) is null or array_length(allowed_slang, 1) <= 50),
  check (array_length(sensitive_topics, 1) is null or array_length(sensitive_topics, 1) <= 30)
);

alter table public.classification_profiles enable row level security;

create policy "members read classification profile"
  on public.classification_profiles for select
  using (public.is_workspace_member(workspace_id));

revoke all on table public.classification_profiles
from public, anon, authenticated;

grant select on table public.classification_profiles to authenticated;

grant select, insert, update, delete on table public.classification_profiles
to service_role;
