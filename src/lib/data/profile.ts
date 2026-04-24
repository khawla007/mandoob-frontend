import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Role } from '@/lib/data/users';

export type ProfileCard = {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  role: Role | null;
  status: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  consentAcceptedAt: string | null;
  createdAt: string | null;
};

export async function getProfileCard(userId: string): Promise<ProfileCard | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id, tenant_id, role, status, full_name, phone, consent_accepted_at, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (!profile) return null;

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  let tenantName: string | null = null;
  let tenantSlug: string | null = null;
  if (profile.tenant_id) {
    const { data: t } = await admin
      .from('tenants')
      .select('slug, name')
      .eq('id', profile.tenant_id)
      .maybeSingle();
    tenantName = (t?.name as string) ?? null;
    tenantSlug = (t?.slug as string) ?? null;
  }

  return {
    id: profile.id as string,
    email: authUser?.user?.email ?? null,
    fullName: (profile.full_name as string | null) ?? null,
    phone: (profile.phone as string | null) ?? null,
    role: (profile.role as Role | null) ?? null,
    status: (profile.status as string | null) ?? null,
    tenantName,
    tenantSlug,
    consentAcceptedAt: (profile.consent_accepted_at as string | null) ?? null,
    createdAt: (profile.created_at as string | null) ?? null,
  };
}
