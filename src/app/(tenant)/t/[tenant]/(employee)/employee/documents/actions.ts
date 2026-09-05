'use server';

import 'server-only';
import { logSafeActionError } from '@/lib/actions/server-action-security';
import { ApiError } from '@/lib/errors';
import { getEmployeeDocumentSignedUrl } from '@/lib/data/employee-portal';
import { authorizeEmployeePortalRead } from '@/lib/data/employee-portal-workspace';

export type EmployeeDocumentActionCode = 'DOCUMENT_UNAVAILABLE' | 'OPEN_FAILED';
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: EmployeeDocumentActionCode };

export async function getEmployeeDocumentSignedUrlAction(
  slug: string,
  versionId: string,
): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  try {
    const access = await authorizeEmployeePortalRead(slug);
    const url = await getEmployeeDocumentSignedUrl(access.session.id, access.tenant.id, versionId);
    return { ok: true, data: { url, expiresAt: new Date(Date.now() + 300_000).toISOString() } };
  } catch (error) {
    logSafeActionError('employee.document.open', error);
    return {
      ok: false,
      code:
        error instanceof ApiError && (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND')
          ? 'DOCUMENT_UNAVAILABLE'
          : 'OPEN_FAILED',
    };
  }
}
