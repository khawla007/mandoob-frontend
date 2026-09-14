import type { SessionProfile } from '@/lib/auth/require-user';
import type { OpenedProCredentialEvidence } from '@/lib/data/pro-credentials';
import { errorResponse } from '@/lib/errors';
import { isOwnedProCredentialEvidencePath } from '@/lib/storage/pro-credential-path';
import { PRO_CREDENTIAL_EVIDENCE_MAX_BYTES } from '@/lib/validation/pro-lifecycle';
import {
  notFoundResponse,
  requireAal2Response,
  requireLiveLifecycleViewer,
} from '@/app/api/v1/_shared/pro-lifecycle-routes';

type Deps = {
  requireViewer(): Promise<SessionProfile>;
  verifyToken(token: string): Promise<string>;
  open(actorId: string, evidenceId: string): Promise<OpenedProCredentialEvidence>;
  download(path: string): Promise<Blob>;
};

const defaults: Deps = {
  requireViewer: requireLiveLifecycleViewer,
  verifyToken: async (token) =>
    (await import('@/lib/security/pro-credential-download-token')).verifyProCredentialDownloadToken(
      token,
    ),
  open: async (...args) =>
    (await import('@/lib/data/pro-credentials')).openProCredentialEvidenceMetadata(...args),
  download: async (path) => {
    const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
    const { data, error } = await createSupabaseServiceRoleClient()
      .storage.from('tenant-documents')
      .download(path);
    if (error || !data) throw new Error('storage_download_failed');
    return data;
  },
};

export function createEvidenceDownloadHandler(overrides: Partial<Deps> = {}) {
  const deps = { ...defaults, ...overrides };
  return async (request: Request): Promise<Response> => {
    try {
      const session = await deps.requireViewer();
      const aal = requireAal2Response(session);
      if (aal) return aal;
      const authorization = request.headers.get('authorization');
      const bearer = authorization?.match(/^Bearer ([A-Za-z0-9_-]{1,4096})$/iu);
      if (!bearer?.[1]) return notFoundResponse();
      const token = bearer[1];
      const evidenceId = await deps.verifyToken(token);
      const evidence = await deps.open(session.id, evidenceId);
      if (
        !isOwnedProCredentialEvidencePath(
          evidence.storage_path,
          evidence.pro_profile_id,
          evidence.credential_id,
          evidence.evidence_id,
        )
      )
        return notFoundResponse();
      if (evidence.size_bytes <= 0 || evidence.size_bytes > PRO_CREDENTIAL_EVIDENCE_MAX_BYTES)
        return notFoundResponse();
      const body = await deps.download(evidence.storage_path);
      if (body.size !== evidence.size_bytes || body.size > PRO_CREDENTIAL_EVIDENCE_MAX_BYTES)
        return notFoundResponse();
      return new Response(body, {
        headers: {
          'content-type': evidence.mime_type,
          'content-length': String(body.size),
          'content-disposition': 'attachment',
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    } catch {
      return errorResponse('NOT_FOUND', 'Resource not found', 404);
    }
  };
}
