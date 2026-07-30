-- Platform-managed CMS pages with public visibility controls.

create table if not exists public.cms_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  excerpt text,
  content_json jsonb not null default '{}'::jsonb,
  content_html text not null default '',
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'archived')),
  published_at timestamptz,
  scheduled_for timestamptz,
  hero_settings jsonb not null default '{}'::jsonb,
  background_image_media_id uuid references public.blog_media(id) on delete set null,
  meta_title text,
  meta_description text,
  canonical_url text,
  noindex boolean not null default false,
  schema_markup jsonb not null default '{}'::jsonb,
  script_head text,
  script_body_start text,
  script_body_end text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cms_pages_slug_not_blank check (length(btrim(slug)) > 0),
  constraint cms_pages_title_not_blank check (length(btrim(title)) > 0),
  constraint cms_pages_status_timestamp_check check (
    (status = 'published' and published_at is not null and scheduled_for is null)
    or (status = 'scheduled' and scheduled_for is not null)
    or (status in ('draft', 'archived'))
  )
);

create unique index if not exists cms_pages_live_slug_uniq
  on public.cms_pages(slug)
  where deleted_at is null;

create index if not exists cms_pages_public_visibility_idx
  on public.cms_pages(status, published_at desc)
  where deleted_at is null;

drop trigger if exists cms_pages_set_updated_at on public.cms_pages;
create trigger cms_pages_set_updated_at
  before update on public.cms_pages
  for each row execute function public.set_updated_at();

alter table public.cms_pages enable row level security;

revoke all on table public.cms_pages from public, anon, authenticated;
grant select on table public.cms_pages to anon;
grant select, insert, update, delete on table public.cms_pages to authenticated;
grant all on table public.cms_pages to service_role;

drop policy if exists cms_pages_public_read_published on public.cms_pages;
create policy cms_pages_public_read_published on public.cms_pages for select
  using (
    deleted_at is null
    and status = 'published'
    and published_at is not null
    and published_at <= now()
  );

drop policy if exists cms_pages_platform_manage on public.cms_pages;
create policy cms_pages_platform_manage on public.cms_pages for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));
