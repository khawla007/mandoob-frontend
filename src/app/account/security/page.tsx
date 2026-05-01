import { PasswordChangeForm } from '@/components/account/PasswordChangeForm';
import { MfaPanel } from '@/components/account/MfaPanel';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/require-user';

export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  const session = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totpFactors = (factors?.totp ?? []).map((f) => ({
    id: f.id,
    status: f.status,
    friendlyName: f.friendly_name ?? null,
  }));
  const mfaMandatory = session.role === 'super_admin' || session.role === 'pro';
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="text-lg font-medium">Change password</h2>
        <PasswordChangeForm />
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-medium">Two-factor authentication</h2>
        <MfaPanel factors={totpFactors} mandatory={mfaMandatory} />
      </section>
    </div>
  );
}
