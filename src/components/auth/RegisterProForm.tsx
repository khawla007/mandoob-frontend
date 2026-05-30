'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { postJson } from '@/lib/http/post';
import { TENANT_PLANS } from '@/lib/validation/tenant-onboarding';

export function RegisterProForm() {
  const tErrors = useTranslations('errors');
  const t = useTranslations('auth');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [name, setName] = useState('');
  const [plan, setPlan] = useState<(typeof TENANT_PLANS)[number]>('starter');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await postJson('/api/v1/public/register-pro', {
        name,
        plan,
        admin_full_name: adminFullName,
        admin_email: adminEmail,
        admin_phone: adminPhone,
      });
      if (!res.ok) {
        try {
          const body = (await res.json()) as { error?: string; code?: string };
          setError(body.error ?? tErrors('couldNotSubmit'));
        } catch {
          setError(tErrors('couldNotSubmit'));
        }
        setPending(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError(tErrors('couldNotSubmit'));
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <Alert>
        <AlertTitle>{t('proSubmittedTitle')}</AlertTitle>
        <AlertDescription>{t('longCopy.proSignupPending', { email: adminEmail })}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{tErrors('couldNotSubmit')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t('firmSection')}</h2>
        <div className="grid gap-2">
          <Label htmlFor="firm-name">{t('firmName')}</Label>
          <Input
            id="firm-name"
            required
            minLength={3}
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme PRO Services"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="firm-plan">{t('plan')}</Label>
          <Select value={plan} onValueChange={(v) => setPlan(v as (typeof TENANT_PLANS)[number])}>
            <SelectTrigger id="firm-plan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TENANT_PLANS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t('yourAccount')}</h2>
        <div className="grid gap-2">
          <Label htmlFor="admin-name">{t('fullName')}</Label>
          <Input
            id="admin-name"
            required
            minLength={1}
            maxLength={200}
            value={adminFullName}
            onChange={(e) => setAdminFullName(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="admin-email">{t('email')}</Label>
          <Input
            id="admin-email"
            type="email"
            required
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="admin-phone">{t('phoneE164')}</Label>
          <Input
            id="admin-phone"
            required
            placeholder="+971501234567"
            value={adminPhone}
            onChange={(e) => setAdminPhone(e.target.value)}
          />
        </div>
      </section>

      <button
        type="submit"
        className="btn btn--accent w-full justify-center"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t('submittingReview')}
          </>
        ) : (
          t('submitForReview')
        )}
      </button>
    </form>
  );
}
