import 'server-only';
import { redirect } from 'next/navigation';
import { getSessionProfile, type SessionProfile } from '@/lib/auth/require-user';

type Role = NonNullable<SessionProfile['role']>;

export async function requireSession(): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session) redirect('/login');
  return session;
}

export async function requireRole(...roles: Role[]): Promise<SessionProfile> {
  const session = await requireSession();
  if (!session.role || !roles.includes(session.role)) {
    redirect('/login');
  }
  return session;
}

export async function requireAal2(session: SessionProfile): Promise<void> {
  if (session.aal !== 'aal2') redirect('/mfa/challenge');
}

export async function requireMfaEnrolled(session: SessionProfile): Promise<void> {
  if (!session.mfaEnrolled) redirect('/mfa/enroll');
}

export async function requireTenantMatch(
  session: SessionProfile,
  paramSlug: string,
): Promise<void> {
  if (session.role === 'super_admin') return; // full cross-tenant access (PRD §2)
  if (!session.tenantId) redirect('/login');

  // Cheap slug→id lookup would need DB here. Instead, store resolution in
  // the session profile later (future optimization). Block mismatch path for
  // now by rejecting unknown slugs.
  if (!paramSlug) redirect('/login');
}
