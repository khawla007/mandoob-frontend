\set ON_ERROR_STOP on

-- The pinned standalone Postgres image supplies the Supabase roles and auth.users,
-- but not the API/storage helpers normally installed by the full local stack.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

alter table auth.users add column if not exists email_confirmed_at timestamptz;

create table if not exists auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz,
  updated_at timestamptz,
  factor_id uuid,
  not_after timestamptz,
  refreshed_at timestamptz,
  user_agent text,
  ip inet,
  tag text
);

create schema if not exists storage authorization supabase_admin;

create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner_id text
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  owner_id text,
  user_metadata jsonb
);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant all on all tables in schema storage to service_role;
