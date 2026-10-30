import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAccountUser } from '@/lib/auth/require-account-user';
import { MfaPanel } from './MfaPanel';

export async function MfaTab() {
  const session = await requireAccountUser();
  const t = await getTranslations('account');
  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totpFactors = (factors?.totp ?? []).map((f) => ({
    id: f.id,
    status: f.status,
    friendlyName: f.friendly_name ?? null,
  }));
  const mandatory = session.role === 'super_admin' || session.role === 'pro';
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">{t('twoFactorAuth')}</h2>
      <MfaPanel factors={totpFactors} mandatory={mandatory} />
    </section>
  );
}
