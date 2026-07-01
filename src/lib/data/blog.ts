import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';

import { sanitizeBlogHtml } from '@/lib/blog/render';
import { normalizeBlogSlug } from '@/lib/blog/slug';
import { ApiError } from '@/lib/errors';
import {
  BLOG_IMAGE_MIMES,
  MAX_GALLERY_IMAGE_BYTES,
  blogPostInputSchema,
  blogTermInputSchema,
  type BlogPostInput,
  type ParsedBlogPostInput,
  type BlogPostStatus,
  type BlogTermInput,
  type BlogTermKind,
} from '@/lib/validation/blog';

const BLOG_MEDIA_BUCKET = 'blog-media';
const BLOG_POST_COLUMNS =
  'id, slug, title, excerpt, content_json, content_html, status, published_at, scheduled_for, meta_title, meta_description, canonical_url, noindex, featured_media_id, author_id, created_by, updated_by, deleted_at, created_at, updated_at';
const BLOG_TERM_COLUMNS =
  'id, kind, slug, name, description, parent_id, sort_order, created_by, created_at, updated_at';
const BLOG_MEDIA_COLUMNS =
  'id, storage_path, public_url, original_name, sha256, alt_text, caption, width, height, mime_type, size_bytes, uploaded_by, created_at, updated_at';

type SupabaseLike = {
  from: (table: string) => SupabaseQueryLike;
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        data: Uint8Array,
        options: { contentType: string; upsert: false },
      ) => Promise<{ error: { message: string } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
      remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
    };
  };
};

type SupabaseQueryResult = {
  data: unknown;
  error: { message: string } | null;
};

type SupabaseQueryLike = PromiseLike<SupabaseQueryResult> & {
  select: (columns?: string, options?: unknown) => SupabaseQueryLike;
  order: (column: string, options?: { ascending?: boolean }) => SupabaseQueryLike;
  eq: (column: string, value: unknown) => SupabaseQueryLike;
  is: (column: string, value: unknown) => SupabaseQueryLike;
  not: (column: string, operator: string, value: unknown) => SupabaseQueryLike;
  lte: (column: string, value: unknown) => SupabaseQueryLike;
  maybeSingle: () => Promise<SupabaseQueryResult>;
  single: () => Promise<SupabaseQueryResult>;
  insert: (payload: unknown) => SupabaseQueryLike;
  update: (payload: unknown) => SupabaseQueryLike;
  delete: () => SupabaseQueryLike;
};

export type BlogActor = {
  id: string;
  role: 'super_admin' | 'admin' | string;
};

export type BlogTerm = {
  id: string;
  kind: BlogTermKind;
  slug: string;
  name: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  contentJson: Record<string, unknown>;
  contentHtml: string;
  status: BlogPostStatus;
  publishedAt: string | null;
  scheduledFor: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
  featuredMediaId: string | null;
  authorId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BlogMedia = {
  id: string;
  storagePath: string;
  publicUrl: string;
  originalName: string;
  sha256: string;
  altText: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  mimeType: (typeof BLOG_IMAGE_MIMES)[number];
  sizeBytes: number;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UploadBlogMediaInput = {
  file: {
    data: Uint8Array;
    originalName: string;
    mimeType: string;
  };
  altText?: string | null;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
};

type BlogTermRow = {
  id: string;
  kind: BlogTermKind;
  slug: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type BlogPostRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_json: Record<string, unknown>;
  content_html: string;
  status: BlogPostStatus;
  published_at: string | null;
  scheduled_for: string | null;
  meta_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  noindex: boolean;
  featured_media_id: string | null;
  author_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type BlogMediaRow = {
  id: string;
  storage_path: string;
  public_url: string;
  original_name: string;
  sha256: string;
  alt_text: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  mime_type: (typeof BLOG_IMAGE_MIMES)[number];
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

type Deps = {
  supabase?: SupabaseLike;
};

type UploadDeps = Deps & {
  scanFile?: (
    data: Uint8Array,
    options: { filename: string },
  ) => Promise<{ clean: boolean; reason?: string; provider?: string }>;
};

function requireBlogWriteActor(actor: BlogActor): void {
  if (actor.role !== 'super_admin' && actor.role !== 'admin') {
    throw new ApiError('FORBIDDEN', 'Only platform admins can manage blog content', 403);
  }
}

async function getSupabase(deps: Deps = {}): Promise<SupabaseLike> {
  if (deps.supabase) return deps.supabase;
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  return createSupabaseServiceRoleClient() as unknown as SupabaseLike;
}

function handleError(error: { message: string } | null, fallback: string): void {
  if (error) throw new ApiError('INTERNAL', error.message || fallback, 500);
}

async function safeRestoreBlogPostMutation(args: {
  supabase: SupabaseLike;
  postId: string;
  previousPost: BlogPostRow | null;
  previousTerms: Array<{ post_id: string; term_id: string }> | null;
  previousGallery: Array<{
    post_id: string;
    media_id: string;
    sort_order: number;
    alt_text: string | null;
    caption: string | null;
  }> | null;
}) {
  try {
    if (!args.previousPost) {
      await args.supabase
        .from('blog_posts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', args.postId);
      return;
    }

    const { id: _id, ...previousPostPayload } = args.previousPost;
    void _id;
    await args.supabase.from('blog_posts').update(previousPostPayload).eq('id', args.postId);
    await args.supabase.from('blog_post_terms').delete().eq('post_id', args.postId);
    if (args.previousTerms?.length) {
      await args.supabase.from('blog_post_terms').insert(args.previousTerms);
    }
    await args.supabase.from('blog_post_gallery_items').delete().eq('post_id', args.postId);
    if (args.previousGallery?.length) {
      await args.supabase.from('blog_post_gallery_items').insert(args.previousGallery);
    }
  } catch (error) {
    console.error('blog post rollback failed', error);
  }
}

function mapPostTimestamps(input: ParsedBlogPostInput): Pick<
  BlogPostRow,
  'published_at' | 'scheduled_for'
> {
  if (input.status === 'published') {
    return { published_at: input.publishedAt ?? new Date().toISOString(), scheduled_for: null };
  }
  if (input.status === 'scheduled') {
    return { published_at: input.publishedAt ?? null, scheduled_for: input.scheduledFor ?? null };
  }
  return { published_at: null, scheduled_for: null };
}

function storageSlug(name: string): string {
  const base = name.replace(/\.[^/.]+$/, '');
  return normalizeBlogSlug(base || 'image');
}

function storagePath(originalName: string, ext: string): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `blog/${yyyy}/${mm}/${randomUUID()}-${storageSlug(originalName)}.${ext}`;
}

export function mapBlogTermRow(row: BlogTermRow): BlogTerm {
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    name: row.name,
    description: row.description,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapBlogPostRow(row: BlogPostRow): BlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    contentJson: row.content_json,
    contentHtml: row.content_html,
    status: row.status,
    publishedAt: row.published_at,
    scheduledFor: row.scheduled_for,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    canonicalUrl: row.canonical_url,
    noindex: row.noindex,
    featuredMediaId: row.featured_media_id,
    authorId: row.author_id,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapBlogMediaRow(row: BlogMediaRow): BlogMedia {
  return {
    id: row.id,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    originalName: row.original_name,
    sha256: row.sha256,
    altText: row.alt_text,
    caption: row.caption,
    width: row.width,
    height: row.height,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listBlogTerms(kind?: BlogTermKind, deps: Deps = {}): Promise<BlogTerm[]> {
  const supabase = await getSupabase(deps);
  let query = supabase
    .from('blog_terms')
    .select(BLOG_TERM_COLUMNS)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (kind) query = query.eq('kind', kind);

  const { data, error } = await query;
  handleError(error, 'Could not list blog terms');
  return ((data as BlogTermRow[] | null) ?? []).map(mapBlogTermRow);
}

export async function createBlogTerm(
  input: BlogTermInput,
  actor: BlogActor,
  deps: Deps = {},
): Promise<BlogTerm> {
  requireBlogWriteActor(actor);
  const parsed = blogTermInputSchema.parse(input);
  const supabase = await getSupabase(deps);
  const { data, error } = await supabase
    .from('blog_terms')
    .insert({
      kind: parsed.kind,
      slug: parsed.slug,
      name: parsed.name,
      description: parsed.description ?? null,
      parent_id: parsed.parentId ?? null,
      sort_order: parsed.sortOrder,
      created_by: actor.id,
    })
    .select(BLOG_TERM_COLUMNS)
    .single();
  handleError(error, 'Could not create blog term');
  if (!data) throw new ApiError('INTERNAL', 'Could not create blog term', 500);
  return mapBlogTermRow(data as BlogTermRow);
}

export async function updateBlogTerm(
  id: string,
  input: Partial<BlogTermInput>,
  actor: BlogActor,
  deps: Deps = {},
): Promise<BlogTerm> {
  requireBlogWriteActor(actor);
  const parsed = blogTermInputSchema.partial().parse(input);
  const supabase = await getSupabase(deps);
  const { data, error } = await supabase
    .from('blog_terms')
    .update({
      ...(parsed.kind ? { kind: parsed.kind } : {}),
      ...(parsed.slug ? { slug: parsed.slug } : {}),
      ...(parsed.name ? { name: parsed.name } : {}),
      ...(parsed.description !== undefined ? { description: parsed.description } : {}),
      ...(parsed.parentId !== undefined ? { parent_id: parsed.parentId } : {}),
      ...(parsed.sortOrder !== undefined ? { sort_order: parsed.sortOrder } : {}),
    })
    .eq('id', id)
    .select(BLOG_TERM_COLUMNS)
    .single();
  handleError(error, 'Could not update blog term');
  if (!data) throw new ApiError('NOT_FOUND', 'Blog term not found', 404);
  return mapBlogTermRow(data as BlogTermRow);
}

export async function deleteBlogTerm(
  id: string,
  actor: BlogActor,
  deps: Deps = {},
): Promise<void> {
  requireBlogWriteActor(actor);
  const supabase = await getSupabase(deps);
  const { error } = await supabase.from('blog_terms').delete().eq('id', id);
  handleError(error, 'Could not delete blog term');
}

export async function listAdminBlogPosts(deps: Deps = {}): Promise<BlogPost[]> {
  const supabase = await getSupabase(deps);
  const { data, error } = await supabase
    .from('blog_posts')
    .select(BLOG_POST_COLUMNS)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });
  handleError(error, 'Could not list blog posts');
  return ((data as BlogPostRow[] | null) ?? []).map(mapBlogPostRow);
}

export async function getAdminBlogPost(id: string, deps: Deps = {}): Promise<BlogPost | null> {
  const supabase = await getSupabase(deps);
  const { data, error } = await supabase
    .from('blog_posts')
    .select(BLOG_POST_COLUMNS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  handleError(error, 'Could not read blog post');
  return data ? mapBlogPostRow(data as BlogPostRow) : null;
}

export async function upsertBlogPost(
  input: BlogPostInput,
  actor: BlogActor,
  id?: string,
  deps: Deps = {},
): Promise<BlogPost> {
  requireBlogWriteActor(actor);
  const parsed = blogPostInputSchema.parse({
    ...input,
    slug: normalizeBlogSlug(input.slug || input.title),
  });
  const supabase = await getSupabase(deps);
  const [previousPostResult, previousTermsResult, previousGalleryResult] = id
    ? await Promise.all([
        supabase
          .from('blog_posts')
          .select(BLOG_POST_COLUMNS)
          .eq('id', id)
          .maybeSingle(),
        supabase.from('blog_post_terms').select('post_id, term_id').eq('post_id', id),
        supabase
          .from('blog_post_gallery_items')
          .select('post_id, media_id, sort_order, alt_text, caption')
          .eq('post_id', id),
      ])
    : [null, null, null];
  if (previousPostResult) handleError(previousPostResult.error, 'Could not snapshot blog post');
  if (previousTermsResult) handleError(previousTermsResult.error, 'Could not snapshot blog post terms');
  if (previousGalleryResult) {
    handleError(previousGalleryResult.error, 'Could not snapshot blog post gallery');
  }

  const timestamps = mapPostTimestamps(parsed);
  const payload = {
    slug: parsed.slug,
    title: parsed.title,
    excerpt: parsed.excerpt ?? null,
    content_json: parsed.contentJson,
    content_html: sanitizeBlogHtml(parsed.contentHtml),
    status: parsed.status,
    published_at: timestamps.published_at,
    scheduled_for: timestamps.scheduled_for,
    meta_title: parsed.metaTitle ?? null,
    meta_description: parsed.metaDescription ?? null,
    canonical_url: parsed.canonicalUrl ?? null,
    noindex: parsed.noindex,
    featured_media_id: parsed.featuredMediaId ?? null,
    author_id: actor.id,
    updated_by: actor.id,
    ...(id ? {} : { created_by: actor.id }),
  };

  const mutation = id
    ? supabase.from('blog_posts').update(payload).eq('id', id)
    : supabase.from('blog_posts').insert(payload);
  const { data, error } = await mutation.select(BLOG_POST_COLUMNS).single();
  handleError(error, 'Could not save blog post');
  if (!data) throw new ApiError('INTERNAL', 'Could not save blog post', 500);
  const post = mapBlogPostRow(data as BlogPostRow);

  try {
    const { error: deleteTermsError } = await supabase
      .from('blog_post_terms')
      .delete()
      .eq('post_id', post.id);
    handleError(deleteTermsError, 'Could not update blog post terms');
    if (parsed.termIds.length > 0) {
      const { error: insertTermsError } = await supabase.from('blog_post_terms').insert(
        parsed.termIds.map((termId) => ({
          post_id: post.id,
          term_id: termId,
        })),
      );
      handleError(insertTermsError, 'Could not update blog post terms');
    }

    const { error: deleteGalleryError } = await supabase
      .from('blog_post_gallery_items')
      .delete()
      .eq('post_id', post.id);
    handleError(deleteGalleryError, 'Could not update blog post gallery');
    if (parsed.galleryMediaIds.length > 0) {
      const { error: insertGalleryError } = await supabase.from('blog_post_gallery_items').insert(
        parsed.galleryMediaIds.map((mediaId, index) => ({
          post_id: post.id,
          media_id: mediaId,
          sort_order: index,
        })),
      );
      handleError(insertGalleryError, 'Could not update blog post gallery');
    }

    const { error: revisionError } = await supabase.from('blog_post_revisions').insert({
      post_id: post.id,
      created_by: actor.id,
      title: post.title,
      excerpt: post.excerpt,
      content_json: post.contentJson,
      content_html: post.contentHtml,
      status: post.status,
      revision_note: id ? 'Updated blog post' : 'Created blog post',
    });
    handleError(revisionError, 'Could not create blog post revision');
  } catch (error) {
    await safeRestoreBlogPostMutation({
      supabase,
      postId: post.id,
      previousPost: previousPostResult?.data ? (previousPostResult.data as BlogPostRow) : null,
      previousTerms: (previousTermsResult?.data as Array<{ post_id: string; term_id: string }> | null) ?? null,
      previousGallery:
        (previousGalleryResult?.data as Array<{
          post_id: string;
          media_id: string;
          sort_order: number;
          alt_text: string | null;
          caption: string | null;
        }> | null) ?? null,
    });
    throw error;
  }

  return post;
}

export async function softDeleteBlogPost(
  id: string,
  actor: BlogActor,
  deps: Deps = {},
): Promise<void> {
  requireBlogWriteActor(actor);
  const supabase = await getSupabase(deps);
  const { error } = await supabase
    .from('blog_posts')
    .update({ deleted_at: new Date().toISOString(), updated_by: actor.id })
    .eq('id', id);
  handleError(error, 'Could not delete blog post');
}

export async function listPublishedBlogPosts(deps: Deps = {}): Promise<BlogPost[]> {
  const supabase = await getSupabase(deps);
  const { data, error } = await supabase
    .from('blog_posts')
    .select(BLOG_POST_COLUMNS)
    .eq('status', 'published')
    .is('deleted_at', null)
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false });
  handleError(error, 'Could not list published blog posts');
  return ((data as BlogPostRow[] | null) ?? []).map(mapBlogPostRow);
}

export async function getPublishedBlogPostBySlug(
  slug: string,
  deps: Deps = {},
): Promise<BlogPost | null> {
  const supabase = await getSupabase(deps);
  const { data, error } = await supabase
    .from('blog_posts')
    .select(BLOG_POST_COLUMNS)
    .eq('slug', normalizeBlogSlug(slug))
    .eq('status', 'published')
    .is('deleted_at', null)
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .maybeSingle();
  handleError(error, 'Could not read blog post');
  return data ? mapBlogPostRow(data as BlogPostRow) : null;
}

export async function uploadBlogMedia(
  input: UploadBlogMediaInput,
  actor: BlogActor,
  deps: UploadDeps = {},
): Promise<BlogMedia> {
  requireBlogWriteActor(actor);
  const { data, originalName, mimeType: declaredMime } = input.file;
  if (data.byteLength === 0) {
    throw new ApiError('PAYLOAD_EMPTY', 'file is empty', 400);
  }
  if (data.byteLength > MAX_GALLERY_IMAGE_BYTES) {
    throw new ApiError('PAYLOAD_TOO_LARGE', `file exceeds ${MAX_GALLERY_IMAGE_BYTES} bytes`, 413, {
      max_bytes: MAX_GALLERY_IMAGE_BYTES,
      actual_bytes: data.byteLength,
    });
  }

  const sniffed = await fileTypeFromBuffer(data);
  if (!sniffed || !BLOG_IMAGE_MIMES.includes(sniffed.mime as (typeof BLOG_IMAGE_MIMES)[number])) {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'file type not allowed', 415, {
      sniffed_mime: sniffed?.mime ?? null,
      declared_mime: declaredMime,
    });
  }
  if (declaredMime !== sniffed.mime) {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'declared MIME does not match content', 415, {
      sniffed_mime: sniffed.mime,
      declared_mime: declaredMime,
    });
  }

  const scanFile =
    deps.scanFile ?? (await import('@/lib/security/scan-file')).scanFile;
  const scan = await scanFile(data, { filename: originalName });
  if (!scan.clean) {
    if (scan.reason === 'scanner_unavailable') {
      throw new ApiError(
        'SCANNER_UNAVAILABLE',
        'Virus scanner is temporarily unavailable. Try again shortly.',
        503,
        { reason: scan.reason, scanner_provider: scan.provider ?? null },
      );
    }
    throw new ApiError('FILE_REJECTED_BY_SCAN', 'file failed virus scan', 422, {
      reason: scan.reason ?? null,
      scanner_provider: scan.provider ?? null,
    });
  }

  const sha256 = createHash('sha256').update(data).digest('hex');
  const supabase = await getSupabase(deps);
  const path = storagePath(originalName, sniffed.ext);
  const { error: uploadError } = await supabase.storage.from(BLOG_MEDIA_BUCKET).upload(path, data, {
    contentType: sniffed.mime,
    upsert: false,
  });
  if (uploadError) throw new ApiError('STORAGE_UPLOAD_FAILED', uploadError.message, 502);

  const publicUrl = supabase.storage.from(BLOG_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  const { data: row, error: insertError } = await supabase
    .from('blog_media')
    .insert({
      storage_path: path,
      public_url: publicUrl,
      original_name: originalName,
      sha256,
      alt_text: input.altText ?? null,
      caption: input.caption ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      mime_type: sniffed.mime,
      size_bytes: data.byteLength,
      uploaded_by: actor.id,
    })
    .select(BLOG_MEDIA_COLUMNS)
    .single();
  if (insertError) {
    const { error: removeError } = await supabase.storage.from(BLOG_MEDIA_BUCKET).remove([path]);
    if (removeError) console.error('blog media orphan cleanup failed', removeError);
    handleError(insertError, 'Could not create blog media');
  }
  if (!row) throw new ApiError('INTERNAL', 'Could not create blog media', 500);
  return mapBlogMediaRow(row as BlogMediaRow);
}
