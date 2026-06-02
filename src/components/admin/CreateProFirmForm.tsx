'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
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
import { createProFirmAction } from '@/app/admin/pro-firms/actions';
import { TENANT_PLANS } from '@/lib/validation/tenant-onboarding';
import { baseTenantSlug } from '@/lib/tenant/slug';

export function CreateProFirmForm() {
  const t = useTranslations('admin');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [plan, setPlan] = useState<(typeof TENANT_PLANS)[number]>('starter');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('');

  function onNameChange(v: string) {
    setName(v);
    if (!slugTouched) setSlug(baseTenantSlug(v));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createProFirmAction({
        name,
        slug,
        plan,
        admin_full_name: adminFullName,
        admin_email: adminEmail,
        admin_phone: adminPhone,
      });
      if (!result.ok) {
        setError(`${result.code}: ${result.error}`);
        return;
      }
      router.push('/admin/pro-firms?created=1');
    });
  }

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{t('proFirms.create.couldNotCreate')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t('proFirms.create.firmSection')}</h2>
        <div className="grid gap-2">
          <Label htmlFor="firm-name">{t('proFirms.create.firmName')}</Label>
          <Input
            id="firm-name"
            required
            minLength={3}
            maxLength={200}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Acme PRO Services"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="firm-slug">{t('proFirms.create.slug')}</Label>
          <Input
            id="firm-slug"
            required
            minLength={3}
            maxLength={40}
            pattern="^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            placeholder="acme-pro"
          />
          <p className="text-muted-foreground text-xs">{t('proFirms.create.slugHint')}</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="firm-plan">{t('proFirms.create.plan')}</Label>
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
        <h2 className="text-base font-semibold">{t('proFirms.create.adminSection')}</h2>
        <p className="text-muted-foreground text-xs">{t('proFirms.create.adminIntro')}</p>
        <div className="grid gap-2">
          <Label htmlFor="admin-name">{t('proFirms.create.fullName')}</Label>
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
          <Label htmlFor="admin-email">{t('proFirms.create.email')}</Label>
          <Input
            id="admin-email"
            type="email"
            required
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="admin-phone">{t('proFirms.create.phone')}</Label>
          <Input
            id="admin-phone"
            required
            placeholder="+971501234567"
            value={adminPhone}
            onChange={(e) => setAdminPhone(e.target.value)}
          />
        </div>
      </section>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t('proFirms.create.creating') : t('proFirms.create.submit')}
        </Button>
      </div>
    </form>
  );
}
