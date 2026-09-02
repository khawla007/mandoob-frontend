'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';

import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import {
  logSafeActionError,
  normalizeActionRequestMetadata,
} from '@/lib/actions/server-action-security';
import { createDocumentRequest, getDocumentSignedUrl } from '@/lib/data/documents';
import {
  listDocumentVersionHistory,
  type DocumentVersionHistoryEntry,
} from '@/lib/data/pro-document-center';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import {
  runLoadVersionHistoryAction,
  runOpenDocumentVersionAction,
  runRequestDocumentCenterAction,
  runReviewDocumentCenterAction,
  runSetDocumentExpiryAction,
  type DocumentCenterActionDependencies,
  type DocumentCenterActionResult,
} from './action-logic';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';

export type { DocumentCenterActionResult } from './action-logic';

function dependencies(): DocumentCenterActionDependencies {
  return {
    requirePro: async (slug) => {
      const { session, tenant } = await requireProTenantRouteAccess(slug);
      return { id: session.id, role: session.role, tenantId: tenant.id };
    },
    resolveTenant: resolveTenantBySlug,
    requireActive: requireActiveTenant,
    resolveAssignedCompany: readAssignedCompanyForPro,
    callerMetadata: async () => {
      const requestHeaders = await headers();
      return normalizeActionRequestMetadata(requestHeaders);
    },
    createRequest: createDocumentRequest,
    openVersion: getDocumentSignedUrl,
    loadHistory: listDocumentVersionHistory,
    revalidate: revalidatePath,
    rethrowNavigation: (error) => unstable_rethrow(error),
    logUnexpected: (operation, error) => logSafeActionError(operation, error),
  };
}

export async function requestDocumentCenterAction(
  slug: string,
  previousState: DocumentCenterActionResult<{ requestId: string }> | null,
  formData: FormData,
): Promise<DocumentCenterActionResult<{ requestId: string }>> {
  return runRequestDocumentCenterAction(slug, previousState, formData, dependencies());
}

export async function reviewDocumentCenterAction(
  slug: string,
  previousState: DocumentCenterActionResult | null,
  formData: FormData,
): Promise<DocumentCenterActionResult> {
  return runReviewDocumentCenterAction(slug, previousState, formData, dependencies());
}

export async function openDocumentVersionAction(
  slug: string,
  versionId: string,
): Promise<DocumentCenterActionResult<{ url: string; expiresAt: string }>> {
  return runOpenDocumentVersionAction(slug, versionId, dependencies());
}

export async function loadVersionHistoryAction(
  slug: string,
  documentId: string,
): Promise<DocumentCenterActionResult<DocumentVersionHistoryEntry[]>> {
  return runLoadVersionHistoryAction(slug, documentId, dependencies());
}

export async function setDocumentExpiryAction(
  slug: string,
  previousState: DocumentCenterActionResult | null,
  formData: FormData,
): Promise<DocumentCenterActionResult> {
  return runSetDocumentExpiryAction(slug, previousState, formData, dependencies());
}
