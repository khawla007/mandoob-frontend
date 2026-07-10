import 'server-only';

import { z } from 'zod';

import { sanitizeBlogHtml } from '@/lib/blog/render';
import { ApiError } from '@/lib/errors';
import { pageInputSchema, type PageHeroSettings, type PageInput, type PageStatus } from '@/lib/validation/pages';

const CMS_PAGE_COLUMNS =
  'id, slug, title, content_json, content_html, hero_settings, background_image_media_id, status, published_at, scheduled_for, meta_title, meta_description, canonical_url, noindex, schema_markup, created_by, updated_by, deleted_at, created_at, updated_at';
const CMS_PAGE_LIST_COLUMNS =
  'id, slug, title, status, published_at, scheduled_for, noindex, deleted_at, created_at, updated_at';
const CMS_PAGE_PUBLIC_COLUMNS =
  'id, slug, title, content_json, content_html, hero_settings, background_image_media_id, status, published_at, scheduled_for, meta_title, meta_description, canonical_url, noindex, schema_markup, created_at, updated_at';

type QueryResult = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };
type Query = PromiseLike<QueryResult> & {
  select(columns?: string, options?: { count?: 'exact' }): Query;
  eq(column: string, value: unknown): Query;
  is(column: string, value: unknown): Query;
  lte(column: string, value: unknown): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  range(from: number, to: number): Query;
  insert(payload: unknown): Query;
  update(payload: unknown): Query;
  maybeSingle(): Promise<QueryResult>;
  single(): Promise<QueryResult>;
};
type SupabaseLike = { from(table: string): Query };
export type CmsPageActor = { id: string; role: 'super_admin' | 'admin' | string };
type Deps = { supabase?: SupabaseLike; now?: Date };

const nullableString = z.string().nullable();
const nullableTimestamp = z.string().datetime().nullable();
const timestamp = z.string().datetime();
const jsonObject = z.record(z.string(), z.unknown());
const heroSettingsRowSchema = z.object({
  backgroundColor: z.string(),
  overlayColor: z.string(),
  overlayOpacity: z.number(),
  headingAlignment: z.enum(['left', 'center', 'right']),
  textAlignment: z.enum(['left', 'center', 'right']),
  buttonAlignment: z.enum(['left', 'center', 'right']),
  backgroundImageUrl: nullableString.optional(),
  heading: nullableString.optional(),
  text: nullableString.optional(),
  buttonLabel: nullableString.optional(),
  buttonHref: nullableString.optional(),
  minHeight: z.string().optional(),
  maxWidth: z.string().optional(),
  padding: z.string().optional(),
  margin: z.string().optional(),
}).passthrough();
const cmsPageRowSchema = z.object({
  id: z.string().min(1), slug: z.string().min(1), title: z.string().min(1),
  content_json: jsonObject, content_html: z.string(), hero_settings: heroSettingsRowSchema,
  background_image_media_id: nullableString, status: z.enum(['draft', 'scheduled', 'published', 'archived']),
  published_at: nullableTimestamp, scheduled_for: nullableTimestamp, meta_title: nullableString,
  meta_description: nullableString, canonical_url: nullableString, noindex: z.boolean(),
  schema_markup: jsonObject.nullable(), created_by: nullableString, updated_by: nullableString,
  deleted_at: nullableTimestamp, created_at: timestamp, updated_at: timestamp,
});
const cmsPageListRowSchema = cmsPageRowSchema.pick({
  id: true, slug: true, title: true, status: true, published_at: true, scheduled_for: true,
  noindex: true, deleted_at: true, created_at: true, updated_at: true,
});
const cmsPagePublicRowSchema = cmsPageRowSchema.omit({ created_by: true, updated_by: true, deleted_at: true });
const sitemapRowSchema = z.object({
  slug: z.string().min(1),
  updated_at: timestamp,
}).strict();

export type CmsPage = {
  id: string; slug: string; title: string; contentJson: Record<string, unknown>; contentHtml: string;
  heroSettings: PageHeroSettings; backgroundImageMediaId: string | null; status: PageStatus;
  publishedAt: string | null; scheduledFor: string | null; metaTitle: string | null;
  metaDescription: string | null; canonicalUrl: string | null; noindex: boolean;
  schemaMarkup: Record<string, unknown> | null; createdBy: string | null; updatedBy: string | null;
  deletedAt: string | null; createdAt: string; updatedAt: string;
};
export type CmsPageListItem = Pick<CmsPage, 'id' | 'slug' | 'title' | 'status' | 'publishedAt' | 'scheduledFor' | 'noindex' | 'deletedAt' | 'createdAt' | 'updatedAt'>;
export type CmsPagePage = { items: CmsPageListItem[]; total: number; page: number; pageSize: number };
export type CmsPageUpsertInput = PageInput & { id?: string; backgroundImageMediaId?: string | null };

async function getSupabase(deps: Deps): Promise<SupabaseLike> {
  if (deps.supabase) return deps.supabase;
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  return createSupabaseServiceRoleClient() as unknown as SupabaseLike;
}

function requireActor(actor: CmsPageActor): void {
  if (actor.role !== 'admin' && actor.role !== 'super_admin') {
    throw new ApiError('FORBIDDEN', 'Only platform admins can manage CMS pages', 403);
  }
}

function throwQueryError(error: QueryResult['error'], fallback: string): void {
  if (!error) return;
  console.error(fallback, error);
  if (error.code === '23505') {
    throw new ApiError('DUPLICATE_SLUG', 'A CMS page with this slug already exists', 409);
  }
  throw new ApiError('INTERNAL', fallback, 500);
}

function isMissingMutation(error: QueryResult['error'], data: unknown): boolean {
  return !data || error?.code === 'PGRST116';
}

export function mapCmsPageRow(value: unknown): CmsPage {
  const parsed = cmsPageRowSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError('INVALID_DATA', 'CMS page data is malformed', 500);
  }
  const row = parsed.data;
  return {
    id: row.id, slug: row.slug, title: row.title, contentJson: row.content_json,
    contentHtml: row.content_html, heroSettings: row.hero_settings,
    backgroundImageMediaId: row.background_image_media_id, status: row.status,
    publishedAt: row.published_at, scheduledFor: row.scheduled_for, metaTitle: row.meta_title,
    metaDescription: row.meta_description, canonicalUrl: row.canonical_url, noindex: row.noindex,
    schemaMarkup: row.schema_markup, createdBy: row.created_by, updatedBy: row.updated_by,
    deletedAt: row.deleted_at, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapListRow(value: unknown): CmsPageListItem {
  const parsed = cmsPageListRowSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError('INVALID_DATA', 'CMS page list data is malformed', 500);
  }
  const row = parsed.data;
  return { id: row.id, slug: row.slug, title: row.title, status: row.status, publishedAt: row.published_at,
    scheduledFor: row.scheduled_for, noindex: row.noindex, deletedAt: row.deleted_at,
    createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapPublicRow(value: unknown): CmsPage {
  const parsed = cmsPagePublicRowSchema.safeParse(value);
  if (!parsed.success) throw new ApiError('INVALID_DATA', 'CMS page data is malformed', 500);
  return mapCmsPageRow({ ...parsed.data, created_by: null, updated_by: null, deleted_at: null });
}

export async function listAdminCmsPages(
  options: { page?: number; pageSize?: number } = {}, deps: Deps = {},
): Promise<CmsPagePage> {
  const page = Math.max(1, Math.trunc(Number.isFinite(options.page) ? options.page! : 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(Number.isFinite(options.pageSize) ? options.pageSize! : 8)));
  const from = (page - 1) * pageSize;
  const db = await getSupabase(deps);
  const { data, error, count } = await db.from('cms_pages').select(CMS_PAGE_LIST_COLUMNS, { count: 'exact' })
    .is('deleted_at', null).order('updated_at', { ascending: false }).order('id', { ascending: false })
    .range(from, from + pageSize - 1);
  throwQueryError(error, 'Unable to list CMS pages');
  return { items: ((data ?? []) as unknown[]).map(mapListRow), total: count ?? 0, page, pageSize };
}

export async function getAdminCmsPage(id: string, deps: Deps = {}): Promise<CmsPage | null> {
  const db = await getSupabase(deps);
  const { data, error } = await db.from('cms_pages').select(CMS_PAGE_COLUMNS).eq('id', id)
    .is('deleted_at', null).maybeSingle();
  throwQueryError(error, 'Unable to load CMS page');
  return data ? mapCmsPageRow(data) : null;
}

async function canonicalHero(
  db: SupabaseLike, heroSettings: PageHeroSettings | undefined, mediaId: string | null | undefined,
): Promise<{ heroSettings: PageHeroSettings; mediaId: string | null }> {
  const hero = { ...(heroSettings ?? {}) } as PageHeroSettings;
  if (!mediaId) return { heroSettings: { ...hero, backgroundImageUrl: null }, mediaId: null };
  const { data, error } = await db.from('blog_media').select('id, public_url').eq('id', mediaId)
    .is('deleted_at', null).maybeSingle();
  throwQueryError(error, 'Unable to validate background image');
  const media = data as { id: string; public_url: string } | null;
  if (!media?.public_url) throw new ApiError('INVALID_MEDIA', 'Background image is unavailable', 400);
  return { heroSettings: { ...hero, backgroundImageUrl: media.public_url }, mediaId: media.id };
}

export async function upsertCmsPage(input: CmsPageUpsertInput, actor: CmsPageActor, deps: Deps = {}): Promise<CmsPage> {
  requireActor(actor);
  const { id, backgroundImageMediaId, ...pageInput } = input;
  const parsed = pageInputSchema.parse(pageInput);
  const db = await getSupabase(deps);
  const canonical = await canonicalHero(db, parsed.heroSettings, backgroundImageMediaId);
  const payload = {
    slug: parsed.slug, title: parsed.title, content_json: parsed.contentJson,
    content_html: sanitizeBlogHtml(parsed.contentHtml), hero_settings: canonical.heroSettings,
    background_image_media_id: canonical.mediaId, status: parsed.status, published_at: parsed.publishedAt ?? null,
    scheduled_for: parsed.scheduledFor ?? null, meta_title: parsed.metaTitle ?? null,
    meta_description: parsed.metaDescription ?? null, canonical_url: parsed.canonicalUrl ?? null,
    noindex: parsed.noindex, schema_markup: parsed.schemaMarkup ?? null, updated_by: actor.id,
  };
  const query = id
    ? db.from('cms_pages').update(payload).eq('id', id).is('deleted_at', null)
    : db.from('cms_pages').insert({ ...payload, created_by: actor.id });
  const { data, error } = await query.select(CMS_PAGE_COLUMNS).single();
  if (isMissingMutation(error, data) && error?.code === 'PGRST116') {
    throw new ApiError('NOT_FOUND', 'CMS page not found', 404);
  }
  throwQueryError(error, 'Unable to save CMS page');
  if (!data) throw new ApiError('NOT_FOUND', 'CMS page not found', 404);
  return mapCmsPageRow(data);
}

export async function softDeleteCmsPage(id: string, actor: CmsPageActor, deps: Deps = {}): Promise<void> {
  requireActor(actor);
  const db = await getSupabase(deps);
  const { data, error } = await db.from('cms_pages').update({ deleted_at: (deps.now ?? new Date()).toISOString(), updated_by: actor.id })
    .eq('id', id).is('deleted_at', null).select('id').single();
  if (isMissingMutation(error, data)) {
    if (error && error.code !== 'PGRST116') throwQueryError(error, 'Unable to delete CMS page');
    throw new ApiError('NOT_FOUND', 'CMS page not found', 404);
  }
  throwQueryError(error, 'Unable to delete CMS page');
}

export async function getPublishedCmsPageBySlug(slug: string, deps: Deps = {}): Promise<CmsPage | null> {
  const db = await getSupabase(deps);
  const now = (deps.now ?? new Date()).toISOString();
  const { data, error } = await db.from('cms_pages').select(CMS_PAGE_PUBLIC_COLUMNS).eq('slug', slug)
    .eq('status', 'published').is('deleted_at', null).lte('published_at', now).maybeSingle();
  throwQueryError(error, 'Unable to load CMS page');
  return data ? mapPublicRow(data) : null;
}

export async function listPublishedCmsPages(deps: Deps = {}): Promise<Array<{ slug: string; updatedAt: string }>> {
  const db = await getSupabase(deps);
  const now = (deps.now ?? new Date()).toISOString();
  const { data, error } = await db.from('cms_pages').select('slug, updated_at').eq('status', 'published')
    .is('deleted_at', null).lte('published_at', now).order('updated_at', { ascending: false }).order('slug', { ascending: true });
  throwQueryError(error, 'Unable to list published CMS pages');
  return ((data ?? []) as unknown[]).map((value) => {
    const parsed = sitemapRowSchema.safeParse(value);
    if (!parsed.success) throw new ApiError('INVALID_DATA', 'CMS sitemap data is malformed', 500);
    return { slug: parsed.data.slug, updatedAt: parsed.data.updated_at };
  });
}
