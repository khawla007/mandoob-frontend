import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Role } from './roles';

export async function resolveRoleHome(args: {
  role: Role | null;
  tenantId: string | null;
}): Promise<string> {
  if (args.role === 'super_admin' || args.role === 'admin') return '/admin';
  if (!args.tenantId) return '/login';
  const admin = createSupabaseServiceRoleClient();
  const { data } = await admin.from('tenants').select('slug').eq('id', args.tenantId).maybeSingle();
  const slug = data?.slug as string | undefined;
  if (!slug) return '/login';
  switch (args.role) {
    case 'pro':
      return `/t/${slug}/dashboard`;
    case 'customer':
      return `/t/${slug}/portal`;
    case 'employee':
      return `/t/${slug}/me`;
    default:
      return '/login';
  }
}
