import type { SessionProfile } from '@/lib/auth/require-user';
import {
  requireLiveProAccount,
  type LiveLifecycleViewerDeps,
} from '@/app/api/v1/_shared/pro-lifecycle-routes';

type ProRolePageAccessDeps = {
  liveViewer?: LiveLifecycleViewerDeps;
};

export async function requireProRolePageAccess(
  deps: ProRolePageAccessDeps = {},
): Promise<SessionProfile> {
  const session = await requireLiveProAccount(deps.liveViewer);
  if (session.aal !== 'aal2') throw new Error('ACCESS_DENIED');
  return session;
}
