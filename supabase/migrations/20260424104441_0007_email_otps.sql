
create table if not exists public.email_otps (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email citext not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_otps_email_idx on public.email_otps (email);

alter table public.email_otps enable row level security;

-- No user-facing access. All reads/writes via service role.
create policy email_otps_no_access on public.email_otps for all using (false) with check (false);
