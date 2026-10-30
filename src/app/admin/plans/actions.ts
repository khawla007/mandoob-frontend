'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { activateCatalog, cloneCatalog, editCatalog } from '@/lib/finance/catalog-repository';
import {
  runActivateCatalogAction,
  runCloneCatalogAction,
  runEditCatalogAction,
  type AdminPlanActionDependencies,
} from './action-logic';

const dependencies: AdminPlanActionDependencies = {
  requireActor: async () => {
    const actor = await requirePlatformOperator();
    return { id: actor.id, aal: actor.aal };
  },
  clone: (input) =>
    cloneCatalog({ ...input, catalogKey: `draft-${input.operationId}`, label: 'Catalog draft' }),
  edit: editCatalog,
  activate: activateCatalog,
  revalidate: revalidatePath,
};
const text = (data: FormData, key: string) => String(data.get(key) ?? '');

export async function cloneCatalogAction(data: FormData) {
  await runCloneCatalogAction(
    {
      sourceVersionId: text(data, 'sourceVersionId'),
      operationId: text(data, 'operationId'),
      reviewReference: text(data, 'reviewReference'),
    },
    dependencies,
  );
}
export async function editCatalogAction(data: FormData) {
  await runEditCatalogAction(
    {
      versionId: text(data, 'versionId'),
      operationId: text(data, 'operationId'),
      expectedRevision: Number(text(data, 'expectedRevision')),
      reviewReference: text(data, 'reviewReference'),
      patch: { label: text(data, 'label') },
    },
    dependencies,
  );
}
export async function activateCatalogAction(data: FormData) {
  await runActivateCatalogAction(
    {
      versionId: text(data, 'versionId'),
      operationId: text(data, 'operationId'),
      expectedRevision: Number(text(data, 'expectedRevision')),
      reviewReference: text(data, 'reviewReference'),
      effectiveFrom: text(data, 'effectiveFrom'),
    },
    dependencies,
  );
}
