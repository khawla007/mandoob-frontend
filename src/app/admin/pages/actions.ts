'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/auth/require-role';
import { getAdminCmsPage, softDeleteCmsPage, upsertCmsPage } from '@/lib/data/pages';
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
  return { id: session.id, role: session.role as CmsPageAdminActor['role'] };
}

const dependencies: CmsPageActionDependencies = {
  requireActor: requireCmsPageAdminActor,
  getPage: getAdminCmsPage,
  upsertPage: upsertCmsPage,
  deletePage: softDeleteCmsPage,
  revalidate: revalidatePath,
};

export async function saveCmsPageAction(id: string | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runSaveCmsPageAction(id, formData, dependencies);
}

export async function deleteCmsPageAction(id: string): Promise<ActionResult> {
  return runDeleteCmsPageAction(id, dependencies);
}
