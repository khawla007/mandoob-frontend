import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Role } from './roles';

export type SessionProfile = {
  id: string;
  email: string | null;
  role: Role | null;
  tenantId: string | null;
  aal: 'aal1' | 'aal2';
  mfaEnrolled: boolean;
};

type AppMetadata = {
  mandoob_role?: Role | null;
  tenant_id?: string | null;
  mandoob_status?: string;
};

export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const appMeta = (data.user.app_metadata ?? {}) as AppMetadata;

  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const aal: SessionProfile['aal'] = aalData?.currentLevel === 'aal2' ? 'aal2' : 'aal1';

  const { data: profile } = await supabase
    .from('profiles')
    .select('mfa_enrolled_at')
    .eq('id', data.user.id)
    .maybeSingle();

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    role: appMeta.mandoob_role ?? null,
    tenantId: appMeta.tenant_id ?? null,
    aal,
    mfaEnrolled: Boolean(profile?.mfa_enrolled_at),
  };
}

export async function requireUser(): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session) throw new Error('UNAUTHENTICATED');
  return session;
}
