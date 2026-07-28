create extension if not exists vector;

create type public.job_status as enum (
  'pending',
  'running',
  'partially_succeeded',
  'succeeded',
  'failed'
);

create type public.connection_status as enum (
  'pending_channel_selection',
  'connected',
  'revoked',
  'disconnected',
  'error'
);

create type public.item_status as enum (
  'pending',
  'running',
  'succeeded',
  'failed'
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '내 CommentHawk',
  created_at timestamptz not null default now(),
  unique (owner_user_id)
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role = 'owner'),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.youtube_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status public.connection_status not null,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  google_subject text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id)
);

create table public.youtube_channel_candidates (
  connection_id uuid not null
    references public.youtube_connections(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  youtube_channel_id text not null,
  title text not null,
  handle text,
  thumbnail_url text,
  selected boolean not null default false,
  primary key (connection_id, youtube_channel_id)
);

create unique index one_selected_channel_per_workspace
  on public.youtube_channel_candidates(workspace_id)
  where selected;

create table public.youtube_videos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  youtube_channel_id text not null,
  youtube_video_id text not null,
  title text not null,
  thumbnail_url text,
  published_at timestamptz,
  comments_enabled boolean,
  captured_at timestamptz not null default now(),
  unique (workspace_id, youtube_video_id)
);

create table public.comment_import_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  youtube_video_id text not null,
  requested_top_level_count integer not null
    check (requested_top_level_count between 20 and 50),
  next_page_token text,
  status public.job_status not null default 'pending',
  fetched_count integer not null default 0 check (fetched_count >= 0),
  stored_count integer not null default 0 check (stored_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.raw_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  youtube_video_id text not null,
  youtube_comment_id text not null,
  parent_youtube_comment_id text,
  author_channel_id text,
  author_display_name text,
  author_avatar_url text,
  text_display text not null,
  text_original text,
  like_count integer not null default 0 check (like_count >= 0),
  source_moderation_status text,
  published_at timestamptz,
  updated_at timestamptz,
  captured_at timestamptz not null default now(),
  source_deleted_at timestamptz,
  first_import_job_id uuid not null
    references public.comment_import_jobs(id) on delete restrict,
  unique (workspace_id, youtube_comment_id)
);

create table public.raw_comment_payloads (
  raw_comment_id uuid primary key
    references public.raw_comments(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  payload jsonb not null,
  captured_at timestamptz not null default now()
);

create table public.comment_import_items (
  import_job_id uuid not null
    references public.comment_import_jobs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  youtube_comment_id text not null,
  status public.item_status not null,
  raw_comment_id uuid references public.raw_comments(id) on delete set null,
  error_code text,
  created_at timestamptz not null default now(),
  primary key (import_job_id, youtube_comment_id)
);

create index raw_comments_workspace_video_idx
  on public.raw_comments(workspace_id, youtube_video_id, published_at desc);

create index raw_comments_workspace_parent_idx
  on public.raw_comments(workspace_id, parent_youtube_comment_id);

create index import_jobs_workspace_created_idx
  on public.comment_import_jobs(workspace_id, created_at desc);

create or replace function public.protect_raw_comment_source()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.workspace_id is distinct from old.workspace_id
    or new.youtube_video_id is distinct from old.youtube_video_id
    or new.youtube_comment_id is distinct from old.youtube_comment_id
    or new.parent_youtube_comment_id is distinct from old.parent_youtube_comment_id
    or new.author_channel_id is distinct from old.author_channel_id
    or new.author_display_name is distinct from old.author_display_name
    or new.author_avatar_url is distinct from old.author_avatar_url
    or new.text_display is distinct from old.text_display
    or new.text_original is distinct from old.text_original
    or new.like_count is distinct from old.like_count
    or new.source_moderation_status is distinct from old.source_moderation_status
    or new.published_at is distinct from old.published_at
    or new.updated_at is distinct from old.updated_at
    or new.captured_at is distinct from old.captured_at
    or new.first_import_job_id is distinct from old.first_import_job_id
  then
    raise exception 'raw comment source fields are immutable';
  end if;

  return new;
end;
$$;

create trigger raw_comment_source_is_immutable
before update on public.raw_comments
for each row execute function public.protect_raw_comment_source();

create or replace function public.reject_raw_payload_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'raw comment payload is immutable';
end;
$$;

create trigger raw_comment_payload_is_immutable
before update on public.raw_comment_payloads
for each row execute function public.reject_raw_payload_update();
