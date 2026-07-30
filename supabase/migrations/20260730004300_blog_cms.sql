-- Blog CMS schema, public read policies, and media bucket.

create table if not exists public.blog_media (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  public_url text not null,
  original_name text not null,
  sha256 text not null,
  alt_text text,
  caption text,
  width int check (width is null or width > 0),
  height int check (height is null or height > 0),
  mime_type text not null check (mime_type in (
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif'
  )),
  size_bytes integer not null check (size_bytes > 0),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  excerpt text,
  content_json jsonb not null default '{}'::jsonb,
  content_html text not null default '',
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'archived')),
  published_at timestamptz,
  scheduled_for timestamptz,
  meta_title text,
  meta_description text,
  canonical_url text,
  noindex boolean not null default false,
  featured_media_id uuid references public.blog_media(id) on delete set null,
  author_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blog_posts_slug_not_blank check (length(btrim(slug)) > 0),
  constraint blog_posts_title_not_blank check (length(btrim(title)) > 0),
  constraint blog_posts_status_timestamp_check check (
    (status = 'published' and published_at is not null and scheduled_for is null)
    or (status = 'scheduled' and scheduled_for is not null)
    or (status in ('draft', 'archived'))
  )
);

create table if not exists public.blog_terms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('category', 'attribute', 'tag')),
  slug text not null,
  name text not null,
  description text,
  parent_id uuid references public.blog_terms(id) on delete set null,
  sort_order int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blog_terms_slug_not_blank check (length(btrim(slug)) > 0),
  constraint blog_terms_name_not_blank check (length(btrim(name)) > 0),
  unique (kind, slug)
);

create table if not exists public.blog_post_terms (
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  term_id uuid not null references public.blog_terms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, term_id)
);

create table if not exists public.blog_post_gallery_items (
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  media_id uuid not null references public.blog_media(id) on delete cascade,
  sort_order int not null default 0,
  alt_text text,
  caption text,
  created_at timestamptz not null default now(),
  primary key (post_id, media_id)
);

create table if not exists public.blog_post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  excerpt text,
  content_json jsonb not null default '{}'::jsonb,
  content_html text not null default '',
  status text not null check (status in ('draft', 'scheduled', 'published', 'archived')),
  revision_note text,
  created_at timestamptz not null default now()
);

create unique index if not exists blog_posts_live_slug_uniq
  on public.blog_posts(slug)
  where deleted_at is null;

create index if not exists blog_posts_live_status_published_idx
  on public.blog_posts(status, published_at desc)
  where deleted_at is null;

create index if not exists blog_terms_kind_sort_name_idx
  on public.blog_terms(kind, sort_order, name);

create index if not exists blog_post_terms_term_post_idx
  on public.blog_post_terms(term_id, post_id);

create index if not exists blog_post_gallery_items_post_sort_idx
  on public.blog_post_gallery_items(post_id, sort_order);

drop trigger if exists blog_media_set_updated_at on public.blog_media;
create trigger blog_media_set_updated_at
  before update on public.blog_media
  for each row execute function public.set_updated_at();

drop trigger if exists blog_posts_set_updated_at on public.blog_posts;
create trigger blog_posts_set_updated_at
  before update on public.blog_posts
  for each row execute function public.set_updated_at();

drop trigger if exists blog_terms_set_updated_at on public.blog_terms;
create trigger blog_terms_set_updated_at
  before update on public.blog_terms
  for each row execute function public.set_updated_at();

alter table public.blog_media enable row level security;
alter table public.blog_posts enable row level security;
alter table public.blog_terms enable row level security;
alter table public.blog_post_terms enable row level security;
alter table public.blog_post_gallery_items enable row level security;
alter table public.blog_post_revisions enable row level security;

drop policy if exists blog_posts_public_read_published on public.blog_posts;
create policy blog_posts_public_read_published on public.blog_posts for select
  using (
    deleted_at is null
    and status = 'published'
    and published_at is not null
    and published_at <= now()
  );

drop policy if exists blog_terms_public_read on public.blog_terms;
create policy blog_terms_public_read on public.blog_terms for select
  using (true);

drop policy if exists blog_media_public_read on public.blog_media;
create policy blog_media_public_read on public.blog_media for select
  using (true);

drop policy if exists blog_post_terms_public_read on public.blog_post_terms;
create policy blog_post_terms_public_read on public.blog_post_terms for select
  using (
    exists (
      select 1
      from public.blog_posts
      where blog_posts.id = blog_post_terms.post_id
        and blog_posts.deleted_at is null
        and blog_posts.status = 'published'
        and blog_posts.published_at is not null
        and blog_posts.published_at <= now()
    )
  );

drop policy if exists blog_post_gallery_items_public_read on public.blog_post_gallery_items;
create policy blog_post_gallery_items_public_read on public.blog_post_gallery_items for select
  using (
    exists (
      select 1
      from public.blog_posts
      where blog_posts.id = blog_post_gallery_items.post_id
        and blog_posts.deleted_at is null
        and blog_posts.status = 'published'
        and blog_posts.published_at is not null
        and blog_posts.published_at <= now()
    )
  );

drop policy if exists blog_media_platform_manage on public.blog_media;
create policy blog_media_platform_manage on public.blog_media for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));

drop policy if exists blog_posts_platform_manage on public.blog_posts;
create policy blog_posts_platform_manage on public.blog_posts for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));

drop policy if exists blog_terms_platform_manage on public.blog_terms;
create policy blog_terms_platform_manage on public.blog_terms for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));

drop policy if exists blog_post_terms_platform_manage on public.blog_post_terms;
create policy blog_post_terms_platform_manage on public.blog_post_terms for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));

drop policy if exists blog_post_gallery_items_platform_manage on public.blog_post_gallery_items;
create policy blog_post_gallery_items_platform_manage on public.blog_post_gallery_items for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));

drop policy if exists blog_post_revisions_platform_read on public.blog_post_revisions;
create policy blog_post_revisions_platform_read on public.blog_post_revisions for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));

drop policy if exists blog_post_revisions_platform_insert on public.blog_post_revisions;
create policy blog_post_revisions_platform_insert on public.blog_post_revisions for insert
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'blog-media',
  'blog-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists blog_media_storage_public_read on storage.objects;
create policy blog_media_storage_public_read on storage.objects for select
  using (bucket_id = 'blog-media');

drop policy if exists blog_media_storage_platform_insert on storage.objects;
create policy blog_media_storage_platform_insert on storage.objects for insert
  with check (
    bucket_id = 'blog-media'
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin')
  );

drop policy if exists blog_media_storage_platform_update on storage.objects;
create policy blog_media_storage_platform_update on storage.objects for update
  using (
    bucket_id = 'blog-media'
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin')
  )
  with check (
    bucket_id = 'blog-media'
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin')
  );

drop policy if exists blog_media_storage_platform_delete on storage.objects;
create policy blog_media_storage_platform_delete on storage.objects for delete
  using (
    bucket_id = 'blog-media'
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin')
  );
