-- Tenant branding columns + per-tenant communication credential tables.
-- Source: PRD §17.2 (white-label branding), §11.1 (Email/WhatsApp/SMS).
-- All credential columns hold ciphertext from the application crypto layer.

alter table public.tenants
  add column if not exists logo_url text,
  add column if not exists primary_color text,
  add column if not exists secondary_color text,
  add column if not exists favicon_url text,
  add column if not exists email_sender_name text,
  add column if not exists email_reply_to text,
  add column if not exists terms_url text,
  add column if not exists privacy_url text;

-- ============================================================
-- tenant_smtp_config (service-role only)
-- ============================================================
create table if not exists public.tenant_smtp_config (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  host text not null,
  port int not null,
  username text not null,
  password_encrypted text not null,
  from_address text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tenant_smtp_config enable row level security;
drop trigger if exists tenant_smtp_config_set_updated_at on public.tenant_smtp_config;
create trigger tenant_smtp_config_set_updated_at before update on public.tenant_smtp_config
  for each row execute function public.set_updated_at();

-- ============================================================
-- tenant_whatsapp_config
-- ============================================================
create table if not exists public.tenant_whatsapp_config (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  phone_number_id text not null,
  business_account_id text not null,
  access_token_encrypted text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tenant_whatsapp_config enable row level security;
drop trigger if exists tenant_whatsapp_config_set_updated_at on public.tenant_whatsapp_config;
create trigger tenant_whatsapp_config_set_updated_at before update on public.tenant_whatsapp_config
  for each row execute function public.set_updated_at();

-- ============================================================
-- tenant_sms_config
-- ============================================================
create table if not exists public.tenant_sms_config (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('twilio','unifonic')),
  sender_id text not null,
  credentials_encrypted text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tenant_sms_config enable row level security;
drop trigger if exists tenant_sms_config_set_updated_at on public.tenant_sms_config;
create trigger tenant_sms_config_set_updated_at before update on public.tenant_sms_config
  for each row execute function public.set_updated_at();
