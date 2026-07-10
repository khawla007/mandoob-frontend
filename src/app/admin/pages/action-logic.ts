import { z, ZodError } from 'zod';

import { ApiError } from '@/lib/errors';
import { normalizePageSlug } from '@/lib/pages/slug';
import { pageInputSchema, type ParsedPageInput } from '@/lib/validation/pages';

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string; code: string };
export type CmsPageAdminActor = { id: string; role: 'super_admin' | 'admin' };
export type ParsedCmsPageFormData = ParsedPageInput & {
  backgroundImageMediaId: string | null;
  headScripts: string;
  bodyStartScripts: string;
  bodyEndScripts: string;
};
export type CmsPageActionDependencies = {
  requireActor: () => Promise<CmsPageAdminActor>;
  getPage: (id: string) => Promise<{ slug: string } | null>;
  upsertPage: (input: ParsedCmsPageFormData & { id?: string }, actor: CmsPageAdminActor) => Promise<{ id: string; slug: string }>;
  deletePage: (id: string, actor: CmsPageAdminActor) => Promise<void>;
  revalidate: (path: string) => void;
};

const idSchema = z.string().uuid();
const formString = (data: FormData, key: string): string => typeof data.get(key) === 'string' ? data.get(key) as string : '';
const optionalString = (data: FormData, key: string): string | null => formString(data, key).trim() || null;

function optionalIsoTimestamp(data: FormData, key: string): string | null {
  const value = optionalString(data, key);
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError('INVALID_INPUT', `Invalid ${key} timestamp`, 400);
  return date.toISOString();
}

function jsonObject(data: FormData, key: string, empty: Record<string, unknown> | null): Record<string, unknown> | null {
  const raw = formString(data, key).trim();
  if (!raw) return empty;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not object');
    return value as Record<string, unknown>;
  } catch {
    throw new ApiError('INVALID_INPUT', `${key} must be a valid JSON object`, 400);
  }
}

export function parseCmsPageFormData(data: FormData): ParsedCmsPageFormData {
  const title = formString(data, 'title');
  const parsed = pageInputSchema.parse({
    title,
    slug: normalizePageSlug(optionalString(data, 'slug') ?? title),
    contentJson: jsonObject(data, 'contentJson', {}),
    contentHtml: formString(data, 'contentHtml'),
    heroSettings: jsonObject(data, 'heroSettings', {}),
    status: formString(data, 'status'),
    publishedAt: optionalIsoTimestamp(data, 'publishedAt'),
    scheduledFor: optionalIsoTimestamp(data, 'scheduledFor'),
    metaTitle: optionalString(data, 'metaTitle'),
    metaDescription: optionalString(data, 'metaDescription'),
    canonicalUrl: optionalString(data, 'canonicalUrl'),
    noindex: ['true', '1', 'on', 'yes'].includes(formString(data, 'noindex')),
    schemaMarkup: jsonObject(data, 'schemaMarkup', null),
  });
  return {
    ...parsed,
    backgroundImageMediaId: optionalString(data, 'backgroundImageMediaId'),
    headScripts: formString(data, 'headScripts'),
    bodyStartScripts: formString(data, 'bodyStartScripts'),
    bodyEndScripts: formString(data, 'bodyEndScripts'),
  };
}

const invalidId = (): ActionResult<never> => ({ ok: false, error: 'Invalid page ID', code: 'INVALID_INPUT' });
function failure(error: unknown, fallback: string): ActionResult<never> {
  if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message ?? 'Invalid page input', code: 'INVALID_INPUT' };
  if (error instanceof ApiError) {
    if (error.code === 'DUPLICATE_SLUG') return { ok: false, error: 'A CMS page with this slug already exists', code: error.code };
    if (['INVALID_INPUT', 'INVALID_MEDIA', 'NOT_FOUND'].includes(error.code)) return { ok: false, error: error.message, code: error.code };
  }
  console.error(fallback, error);
  return { ok: false, error: fallback, code: 'INTERNAL' };
}
function indexes(deps: CmsPageActionDependencies): void {
  deps.revalidate('/admin/pages');
  deps.revalidate('/sitemap.xml');
}

export async function runSaveCmsPageAction(id: string | null, data: FormData, deps: CmsPageActionDependencies): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await deps.requireActor();
    const parsedId = id ? idSchema.safeParse(id) : null;
    if (parsedId && !parsedId.success) return invalidId();
    const input = parseCmsPageFormData(data);
    const previous = parsedId?.success ? await deps.getPage(parsedId.data) : null;
    const page = await deps.upsertPage(parsedId?.success ? { ...input, id: parsedId.data } : input, actor);
    indexes(deps);
    if (previous?.slug && previous.slug !== page.slug) deps.revalidate(`/${previous.slug}`);
    deps.revalidate(`/${page.slug}`);
    return { ok: true, data: { id: page.id } };
  } catch (error) {
    return failure(error, 'Could not save CMS page');
  }
}

export async function runDeleteCmsPageAction(id: string, deps: CmsPageActionDependencies): Promise<ActionResult> {
  try {
    const actor = await deps.requireActor();
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return invalidId();
    const previous = await deps.getPage(parsedId.data);
    await deps.deletePage(parsedId.data, actor);
    indexes(deps);
    if (previous?.slug) deps.revalidate(`/${previous.slug}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, 'Could not delete CMS page');
  }
}
