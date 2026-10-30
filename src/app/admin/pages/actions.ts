'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { requireAal2, requireRole } from '@/lib/auth/require-role';
import { getAdminCmsPage } from '@/lib/data/pages';
import { mutateEditorialContent } from '@/lib/data/content-mutations';
import {
  runDeleteCmsPageAction,
  runSaveCmsPageAction,
  type ActionResult,
  type CmsPageActionDependencies,
  type CmsPageAdminActor,
} from './action-logic';

export type { ActionResult } from './action-logic';

async function requireCmsPageAdminActor(): Promise<CmsPageAdminActor> {
  const session = await requireRole('super_admin', 'admin');
  await requireAal2(session);
  return { id: session.id, role: session.role as CmsPageAdminActor['role'] };
}

const dependencies: CmsPageActionDependencies = {
  requireActor: requireCmsPageAdminActor,
  getPage: async (id) => {
    const page = await getAdminCmsPage(id);
    return page ? { slug: page.slug, rowVersion: page.rowVersion ?? 1 } : null;
  },
  upsertPage: async (input, actor, durable) => {
    const result = await mutateEditorialContent({
      actorId: actor.id,
      operationId: durable.operationId,
      entityType: 'cms_page',
      action: input.id ? 'update' : 'create',
      entityId: input.id ?? null,
      expectedVersion: durable.expectedVersion,
      payload: cmsPagePayload(input),
    });
    return { id: result.id, slug: result.slug ?? input.slug };
  },
  deletePage: async (id, actor, durable) => {
    await mutateEditorialContent({
      actorId: actor.id,
      operationId: durable.operationId,
      entityType: 'cms_page',
      action: 'delete',
      entityId: id,
      expectedVersion: durable.expectedVersion,
      payload: {},
    });
  },
  revalidate: revalidatePath,
};

export async function saveCmsPageAction(
  id: string | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runSaveCmsPageAction(id, formData, dependencies);
}

export async function deleteCmsPageAction(
  id: string,
  operationId: string,
  expectedVersion: number,
): Promise<ActionResult> {
  return runDeleteCmsPageAction(id, operationId, expectedVersion, dependencies);
}

function cmsPagePayload(input: Parameters<CmsPageActionDependencies['upsertPage']>[0]) {
  return {
    slug: input.slug,
    title: input.title,
    excerpt: null,
    content_json: input.contentJson,
    content_html: input.contentHtml,
    hero_settings: input.heroSettings,
    background_image_media_id: input.backgroundImageMediaId ?? null,
    status: input.status,
    published_at: input.publishedAt,
    scheduled_for: input.scheduledFor,
    meta_title: input.metaTitle,
    meta_description: input.metaDescription,
    canonical_url: input.canonicalUrl,
    noindex: input.noindex,
    schema_markup: input.schemaMarkup ?? {},
    script_head: input.scriptHead,
    script_body_start: input.scriptBodyStart,
    script_body_end: input.scriptBodyEnd,
  };
}
