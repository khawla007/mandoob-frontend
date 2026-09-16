-- P3.04 — durable, replay-safe editorial mutations with optimistic concurrency.

alter table public.blog_posts
  add column if not exists row_version bigint not null default 1 check (row_version > 0);
alter table public.blog_terms
  add column if not exists row_version bigint not null default 1 check (row_version > 0);
alter table public.blog_media
  add column if not exists row_version bigint not null default 1 check (row_version > 0);
alter table public.cms_pages
  add column if not exists row_version bigint not null default 1 check (row_version > 0);

create or replace function public.mutate_editorial_content(
  p_actor_id uuid,
  p_operation_id uuid,
  p_entity_type text,
  p_action text,
  p_entity_id uuid,
  p_expected_version bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := encode(extensions.digest(convert_to(pg_catalog.jsonb_build_object(
    'entity_type', p_entity_type, 'action', p_action, 'entity_id', p_entity_id,
    'expected_version', p_expected_version, 'payload', coalesce(p_payload, '{}'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex');
  v_receipt public.content_operation_receipts%rowtype;
  v_page public.cms_pages%rowtype;
  v_previous_page public.cms_pages%rowtype;
  v_post public.blog_posts%rowtype;
  v_previous_post public.blog_posts%rowtype;
  v_term public.blog_terms%rowtype;
  v_previous_term public.blog_terms%rowtype;
  v_media public.blog_media%rowtype;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text || ':' || p_operation_id::text, 0)
  );
  if not exists (
    select 1 from public.profiles
     where id = p_actor_id and status = 'active' and role in ('super_admin', 'admin')
  ) then raise exception 'forbidden'; end if;

  select * into v_receipt from public.content_operation_receipts
   where actor_id = p_actor_id and operation_id = p_operation_id;
  if found then
    if v_receipt.request_hash <> v_hash then raise exception 'operation_id_conflict'; end if;
    return v_receipt.result;
  end if;

  if p_entity_type = 'cms_page' then
    if p_action = 'create' then
      v_page := pg_catalog.jsonb_populate_record(null::public.cms_pages, p_payload);
      insert into public.cms_pages (
        slug, title, excerpt, content_json, content_html, status, published_at, scheduled_for,
        hero_settings, background_image_media_id, meta_title, meta_description, canonical_url,
        noindex, schema_markup, script_head, script_body_start, script_body_end, created_by, updated_by
      ) values (
        v_page.slug, v_page.title, v_page.excerpt, v_page.content_json, v_page.content_html,
        v_page.status, v_page.published_at, v_page.scheduled_for, v_page.hero_settings,
        v_page.background_image_media_id, v_page.meta_title, v_page.meta_description,
        v_page.canonical_url, v_page.noindex, v_page.schema_markup, v_page.script_head,
        v_page.script_body_start, v_page.script_body_end, p_actor_id, p_actor_id
      ) returning * into v_page;
    else
      select * into v_previous_page from public.cms_pages where id = p_entity_id for update;
      if not found then raise exception 'not_found'; end if;
      if p_expected_version is null or v_previous_page.row_version <> p_expected_version then
        raise exception 'stale_version';
      end if;
      if p_action = 'delete' then
        update public.cms_pages set deleted_at = now(), updated_by = p_actor_id,
          row_version = row_version + 1 where id = p_entity_id returning * into v_page;
      elsif p_action = 'update' then
        v_page := pg_catalog.jsonb_populate_record(null::public.cms_pages, p_payload);
        update public.cms_pages set
          slug = v_page.slug, title = v_page.title, excerpt = v_page.excerpt,
          content_json = v_page.content_json, content_html = v_page.content_html,
          status = v_page.status, published_at = v_page.published_at,
          scheduled_for = v_page.scheduled_for, hero_settings = v_page.hero_settings,
          background_image_media_id = v_page.background_image_media_id,
          meta_title = v_page.meta_title, meta_description = v_page.meta_description,
          canonical_url = v_page.canonical_url, noindex = v_page.noindex,
          schema_markup = v_page.schema_markup, script_head = v_page.script_head,
          script_body_start = v_page.script_body_start, script_body_end = v_page.script_body_end,
          updated_by = p_actor_id, deleted_at = null, row_version = row_version + 1
        where id = p_entity_id returning * into v_page;
      else raise exception 'invalid_action'; end if;
    end if;
    v_result := pg_catalog.jsonb_build_object('id', v_page.id, 'slug', v_page.slug, 'row_version', v_page.row_version);

  elsif p_entity_type = 'blog_post' then
    if p_action = 'create' then
      v_post := pg_catalog.jsonb_populate_record(null::public.blog_posts, p_payload - 'term_ids' - 'gallery_media_ids');
      insert into public.blog_posts (
        slug, title, excerpt, content_json, content_html, status, published_at, scheduled_for,
        meta_title, meta_description, canonical_url, noindex, featured_media_id,
        author_id, created_by, updated_by
      ) values (
        v_post.slug, v_post.title, v_post.excerpt, v_post.content_json, v_post.content_html,
        v_post.status, v_post.published_at, v_post.scheduled_for, v_post.meta_title,
        v_post.meta_description, v_post.canonical_url, v_post.noindex, v_post.featured_media_id,
        p_actor_id, p_actor_id, p_actor_id
      ) returning * into v_post;
    else
      select * into v_previous_post from public.blog_posts where id = p_entity_id for update;
      if not found then raise exception 'not_found'; end if;
      if p_expected_version is null or v_previous_post.row_version <> p_expected_version then
        raise exception 'stale_version';
      end if;
      if p_action = 'delete' then
        update public.blog_posts set deleted_at = now(), updated_by = p_actor_id,
          row_version = row_version + 1 where id = p_entity_id returning * into v_post;
      elsif p_action = 'update' then
        v_post := pg_catalog.jsonb_populate_record(null::public.blog_posts, p_payload - 'term_ids' - 'gallery_media_ids');
        update public.blog_posts set
          slug = v_post.slug, title = v_post.title, excerpt = v_post.excerpt,
          content_json = v_post.content_json, content_html = v_post.content_html,
          status = v_post.status, published_at = v_post.published_at,
          scheduled_for = v_post.scheduled_for, meta_title = v_post.meta_title,
          meta_description = v_post.meta_description, canonical_url = v_post.canonical_url,
          noindex = v_post.noindex, featured_media_id = v_post.featured_media_id,
          updated_by = p_actor_id, deleted_at = null, row_version = row_version + 1
        where id = p_entity_id returning * into v_post;
      else raise exception 'invalid_action'; end if;
    end if;
    if p_action <> 'delete' then
      delete from public.blog_post_terms where post_id = v_post.id;
      insert into public.blog_post_terms(post_id, term_id)
        select v_post.id, value::uuid from pg_catalog.jsonb_array_elements_text(coalesce(p_payload -> 'term_ids', '[]'::jsonb));
      delete from public.blog_post_gallery_items where post_id = v_post.id;
      insert into public.blog_post_gallery_items(post_id, media_id, sort_order)
        select v_post.id, value::uuid, ordinality::integer - 1
        from pg_catalog.jsonb_array_elements_text(coalesce(p_payload -> 'gallery_media_ids', '[]'::jsonb)) with ordinality;
      insert into public.blog_post_revisions (
        post_id, created_by, title, excerpt, content_json, content_html, status, revision_note
      ) values (
        v_post.id, p_actor_id, v_post.title, v_post.excerpt, v_post.content_json,
        v_post.content_html, v_post.status, 'Saved from admin editor'
      );
    end if;
    v_result := pg_catalog.jsonb_build_object('id', v_post.id, 'slug', v_post.slug, 'row_version', v_post.row_version);

  elsif p_entity_type = 'blog_term' then
    if p_action = 'create' then
      v_term := pg_catalog.jsonb_populate_record(null::public.blog_terms, p_payload);
      insert into public.blog_terms(kind, slug, name, description, parent_id, sort_order, created_by)
      values (v_term.kind, v_term.slug, v_term.name, v_term.description, v_term.parent_id, v_term.sort_order, p_actor_id)
      returning * into v_term;
    else
      select * into v_previous_term from public.blog_terms where id = p_entity_id for update;
      if not found then raise exception 'not_found'; end if;
      if p_expected_version is null or v_previous_term.row_version <> p_expected_version then
        raise exception 'stale_version';
      end if;
      if p_action = 'delete' then
        delete from public.blog_terms where id = p_entity_id returning * into v_term;
        v_term.row_version := v_previous_term.row_version + 1;
      elsif p_action = 'update' then
        v_term := pg_catalog.jsonb_populate_record(null::public.blog_terms, p_payload);
        update public.blog_terms set kind = v_term.kind, slug = v_term.slug, name = v_term.name,
          description = v_term.description, parent_id = v_term.parent_id, sort_order = v_term.sort_order,
          row_version = row_version + 1 where id = p_entity_id returning * into v_term;
      else raise exception 'invalid_action'; end if;
    end if;
    v_result := pg_catalog.jsonb_build_object('id', v_term.id, 'slug', v_term.slug, 'row_version', v_term.row_version);

  elsif p_entity_type = 'blog_media' and p_action = 'create' then
    v_media := pg_catalog.jsonb_populate_record(null::public.blog_media, p_payload);
    insert into public.blog_media (
      storage_path, public_url, original_name, sha256, alt_text, caption, width, height,
      mime_type, size_bytes, uploaded_by
    ) values (
      v_media.storage_path, v_media.public_url, v_media.original_name, v_media.sha256,
      v_media.alt_text, v_media.caption, v_media.width, v_media.height, v_media.mime_type,
      v_media.size_bytes, p_actor_id
    ) returning * into v_media;
    v_result := pg_catalog.jsonb_build_object('id', v_media.id, 'public_url', v_media.public_url, 'row_version', v_media.row_version);
  else raise exception 'invalid_entity_or_action'; end if;

  insert into public.content_audit_events (
    actor_id, operation_id, action, entity_type, entity_id, previous_version, next_version
  ) values (
    p_actor_id, p_operation_id, p_entity_type || '.' || p_action, p_entity_type,
    (v_result ->> 'id')::uuid,
    case p_entity_type
      when 'cms_page' then v_previous_page.row_version
      when 'blog_post' then v_previous_post.row_version
      when 'blog_term' then v_previous_term.row_version
      else null
    end,
    (v_result ->> 'row_version')::bigint
  );
  insert into public.content_operation_receipts (
    actor_id, operation_id, operation_kind, request_hash, entity_type, entity_id, result
  ) values (
    p_actor_id, p_operation_id, p_entity_type || '.' || p_action, v_hash, p_entity_type,
    (v_result ->> 'id')::uuid, v_result
  );
  return v_result;
end;
$$;

revoke insert, update, delete on public.blog_posts, public.blog_terms, public.blog_media,
  public.cms_pages, public.blog_post_terms, public.blog_post_gallery_items from authenticated;
revoke all on function public.mutate_editorial_content(uuid, uuid, text, text, uuid, bigint, jsonb) from public;
grant execute on function public.mutate_editorial_content(uuid, uuid, text, text, uuid, bigint, jsonb) to service_role;
