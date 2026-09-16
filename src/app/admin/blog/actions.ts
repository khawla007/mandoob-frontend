'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { z, ZodError } from 'zod';
import { normalizeBlogSlug } from '@/lib/blog/slug';
import { sanitizeBlogHtml } from '@/lib/blog/render';
import { requireAal2, requireRole } from '@/lib/auth/require-role';
import { getAdminBlogPost, uploadBlogMedia } from '@/lib/data/blog';
import { mutateEditorialContent } from '@/lib/data/content-mutations';
import { ApiError } from '@/lib/errors';
import {
  MAX_GALLERY_IMAGE_BYTES,
  blogPostInputSchema,
  blogTermInputSchema,
} from '@/lib/validation/blog';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

type BlogAdminActor = {
  id: string;
  role: 'super_admin' | 'admin';
};

const idSchema = z.string().uuid();
const versionSchema = z.coerce.number().int().positive();

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function optionalString(formData: FormData, key: string): string | null {
  const value = formString(formData, key).trim();
  return value ? value : null;
}

function optionalIsoTimestamp(formData: FormData, key: string): string | null {
  const value = optionalString(formData, key);
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError('INVALID_INPUT', `Invalid ${key} timestamp`, 400);
  }
  return date.toISOString();
}

function optionalNumber(formData: FormData, key: string): number | null {
  const value = optionalString(formData, key);
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError('INVALID_INPUT', `${key} must be a positive integer`, 400);
  }
  return parsed;
}

function formBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === 'true' || value === '1' || value === 'on' || value === 'yes';
}

function formStringList(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseContentJson(formData: FormData): Record<string, unknown> {
  const raw = formString(formData, 'contentJson').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ApiError('INVALID_INPUT', 'contentJson must be a JSON object', 400);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('INVALID_INPUT', 'contentJson must be valid JSON', 400);
  }
}

async function requireBlogAdminActor(): Promise<BlogAdminActor> {
  const session = await requireRole('super_admin', 'admin');
  await requireAal2(session);
  return {
    id: session.id,
    role: session.role as 'super_admin' | 'admin',
  };
}

function revalidateBlogIndex(): void {
  revalidatePath('/admin/blog');
  revalidatePath('/blog');
}

function toResult(e: unknown, fallback: string): ActionResult<never> {
  if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ZodError) {
    return { ok: false, error: e.issues[0]?.message ?? fallback, code: 'INVALID_INPUT' };
  }
  console.error(fallback, e);
  return { ok: false, error: fallback, code: 'INTERNAL' };
}

export async function saveBlogPostAction(
  id: string | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireBlogAdminActor();
    const previousPost = id ? await getAdminBlogPost(idSchema.parse(id)) : null;
    const title = formString(formData, 'title');
    const parsed = blogPostInputSchema.parse({
      title,
      slug: normalizeBlogSlug(optionalString(formData, 'slug') ?? title),
      excerpt: optionalString(formData, 'excerpt'),
      contentJson: parseContentJson(formData),
      contentHtml: formString(formData, 'contentHtml'),
      status: formString(formData, 'status'),
      publishedAt: optionalIsoTimestamp(formData, 'publishedAt'),
      scheduledFor: optionalIsoTimestamp(formData, 'scheduledFor'),
      featuredMediaId: optionalString(formData, 'featuredMediaId'),
      metaTitle: optionalString(formData, 'metaTitle'),
      metaDescription: optionalString(formData, 'metaDescription'),
      canonicalUrl: optionalString(formData, 'canonicalUrl'),
      noindex: formBoolean(formData, 'noindex'),
      termIds: formStringList(formData, 'termIds'),
      galleryMediaIds: formStringList(formData, 'galleryMediaIds'),
    });

    const parsedId = id ? idSchema.parse(id) : null;
    const operationId = idSchema.parse(formString(formData, 'operationId'));
    const expectedVersion = parsedId
      ? versionSchema.parse(formString(formData, 'expectedVersion'))
      : null;
    const timestamps = blogTimestamps(
      parsed.status,
      parsed.publishedAt ?? null,
      parsed.scheduledFor ?? null,
    );
    const post = await mutateEditorialContent({
      actorId: actor.id,
      operationId,
      entityType: 'blog_post',
      action: parsedId ? 'update' : 'create',
      entityId: parsedId,
      expectedVersion,
      payload: {
        slug: parsed.slug,
        title: parsed.title,
        excerpt: parsed.excerpt ?? null,
        content_json: parsed.contentJson,
        content_html: sanitizeBlogHtml(parsed.contentHtml),
        status: parsed.status,
        ...timestamps,
        meta_title: parsed.metaTitle ?? null,
        meta_description: parsed.metaDescription ?? null,
        canonical_url: parsed.canonicalUrl ?? null,
        noindex: parsed.noindex,
        featured_media_id: parsed.featuredMediaId ?? null,
        term_ids: parsed.termIds,
        gallery_media_ids: parsed.galleryMediaIds,
      },
    });
    revalidateBlogIndex();
    if (previousPost?.slug && previousPost.slug !== post.slug) {
      revalidatePath(`/blog/${previousPost.slug}`);
    }
    revalidatePath(`/blog/${post.slug}`);
    return { ok: true, data: { id: post.id } };
  } catch (e) {
    return toResult(e, 'Could not save blog post');
  }
}

export async function deleteBlogPostAction(
  id: string,
  operationId: string,
  expectedVersion: number,
): Promise<ActionResult> {
  try {
    const actor = await requireBlogAdminActor();
    const parsedId = idSchema.parse(id);
    const previousPost = await getAdminBlogPost(parsedId);
    await mutateEditorialContent({
      actorId: actor.id,
      operationId: idSchema.parse(operationId),
      entityType: 'blog_post',
      action: 'delete',
      entityId: parsedId,
      expectedVersion: versionSchema.parse(expectedVersion),
      payload: {},
    });
    revalidateBlogIndex();
    if (previousPost?.slug) revalidatePath(`/blog/${previousPost.slug}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return toResult(e, 'Could not delete blog post');
  }
}

export async function saveBlogTermAction(
  id: string | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await requireBlogAdminActor();
    const name = formString(formData, 'name');
    const parsed = blogTermInputSchema.parse({
      kind: formString(formData, 'kind'),
      name,
      slug: normalizeBlogSlug(optionalString(formData, 'slug') ?? name),
      description: optionalString(formData, 'description'),
      parentId: optionalString(formData, 'parentId'),
      sortOrder: formString(formData, 'sortOrder'),
    });

    const parsedId = id ? idSchema.parse(id) : null;
    await mutateEditorialContent({
      actorId: actor.id,
      operationId: idSchema.parse(formString(formData, 'operationId')),
      entityType: 'blog_term',
      action: parsedId ? 'update' : 'create',
      entityId: parsedId,
      expectedVersion: parsedId
        ? versionSchema.parse(formString(formData, 'expectedVersion'))
        : null,
      payload: {
        kind: parsed.kind,
        name: parsed.name,
        slug: parsed.slug,
        description: parsed.description ?? null,
        parent_id: parsed.parentId ?? null,
        sort_order: parsed.sortOrder,
      },
    });

    revalidateBlogIndex();
    return { ok: true, data: undefined };
  } catch (e) {
    return toResult(e, 'Could not save blog term');
  }
}

export async function deleteBlogTermAction(
  id: string,
  operationId: string,
  expectedVersion: number,
): Promise<ActionResult> {
  try {
    const actor = await requireBlogAdminActor();
    await mutateEditorialContent({
      actorId: actor.id,
      operationId: idSchema.parse(operationId),
      entityType: 'blog_term',
      action: 'delete',
      entityId: idSchema.parse(id),
      expectedVersion: versionSchema.parse(expectedVersion),
      payload: {},
    });
    revalidateBlogIndex();
    return { ok: true, data: undefined };
  } catch (e) {
    return toResult(e, 'Could not delete blog term');
  }
}

export async function uploadBlogMediaAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; publicUrl: string }>> {
  try {
    const actor = await requireBlogAdminActor();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return { ok: false, error: 'File missing from upload', code: 'INVALID_INPUT' };
    }
    if (file.size > MAX_GALLERY_IMAGE_BYTES) {
      return {
        ok: false,
        error: `File exceeds ${MAX_GALLERY_IMAGE_BYTES} bytes`,
        code: 'PAYLOAD_TOO_LARGE',
      };
    }

    const media = await uploadBlogMedia(
      {
        file: {
          data: new Uint8Array(await file.arrayBuffer()),
          originalName: file.name || 'upload',
          mimeType: file.type || 'application/octet-stream',
        },
        altText: optionalString(formData, 'altText') ?? optionalString(formData, 'alt'),
        caption: optionalString(formData, 'caption'),
        width: optionalNumber(formData, 'width'),
        height: optionalNumber(formData, 'height'),
      },
      actor,
      { operationId: idSchema.parse(formString(formData, 'operationId')) },
    );

    revalidateBlogIndex();
    return { ok: true, data: { id: media.id, publicUrl: media.publicUrl } };
  } catch (e) {
    return toResult(e, 'Could not upload blog media');
  }
}

function blogTimestamps(
  status: string,
  publishedAt: string | null,
  scheduledFor: string | null,
): { published_at: string | null; scheduled_for: string | null } {
  if (status === 'published') {
    return { published_at: publishedAt ?? new Date().toISOString(), scheduled_for: null };
  }
  if (status === 'scheduled') return { published_at: null, scheduled_for: scheduledFor };
  return { published_at: null, scheduled_for: null };
}
