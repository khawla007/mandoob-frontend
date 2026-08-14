'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { requireRole } from '@/lib/auth/require-role';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import {
  createDocumentRequest,
  getDocumentSignedUrl,
  setDocumentReview,
} from '@/lib/data/documents';
import {
  runGetDocumentSignedUrlAction,
  runRequestDocumentAction,
  runReviewDocumentVersionAction,
  type ActionResult,
  type LegacyDocumentActionDependencies,
} from './action-logic';

export type { ActionResult } from './action-logic';

function dependencies(): LegacyDocumentActionDependencies {
  return {
    requirePro: async () => {
      const session = await requireRole('pro');
      return { id: session.id, tenantId: session.tenantId };
    },
    resolveTenant: resolveTenantBySlug,
    requireActive: requireActiveTenant,
    callerMetadata: async () => {
      const requestHeaders = await headers();
      return {
        ip: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
        userAgent: requestHeaders.get('user-agent'),
      };
    },
    createRequest: createDocumentRequest,
    reviewVersion: setDocumentReview,
    openVersion: getDocumentSignedUrl,
    revalidate: revalidatePath,
    rethrowNavigation: (error) => unstable_rethrow(error),
    logUnexpected: (label, error) => console.error(label, error),
  };
}

export async function requestDocumentAction(
  slug: string,
  raw: unknown,
): Promise<ActionResult<{ requestId: string }>> {
  return runRequestDocumentAction(slug, raw, dependencies());
}

export async function reviewDocumentVersionAction(
  slug: string,
  clientId: string,
  versionId: string,
  raw: unknown,
): Promise<ActionResult<void>> {
  return runReviewDocumentVersionAction(slug, clientId, versionId, raw, dependencies());
}

export async function getDocumentSignedUrlAction(
  slug: string,
  versionId: string,
): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  return runGetDocumentSignedUrlAction(slug, versionId, dependencies());
}
