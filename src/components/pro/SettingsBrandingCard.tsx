'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { updateBrandingAction } from '@/app/(tenant)/t/[tenant]/(pro)/settings/actions';
import type { TenantBranding } from '@/lib/data/tenant-settings';

export function SettingsBrandingCard({ slug, initial }: { slug: string; initial: TenantBranding }) {
  const t = useTranslations('pro.settings');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState(initial.name ?? '');
  const [logoUrl, setLogoUrl] = useState(initial.logo_url ?? '');
  const [faviconUrl, setFaviconUrl] = useState(initial.favicon_url ?? '');
  const [primary, setPrimary] = useState(initial.primary_color ?? '');
  const [secondary, setSecondary] = useState(initial.secondary_color ?? '');

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await updateBrandingAction(slug, {
        name,
        logo_url: logoUrl,
        favicon_url: faviconUrl,
        primary_color: primary,
        secondary_color: secondary,
      });
      if (!r.ok) {
        setError(`${r.code}: ${r.error}`);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('branding.title')}</CardTitle>
        <CardDescription>{t('branding.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{t('couldNotSave')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {saved && (
            <Alert>
              <AlertTitle>{t('saved')}</AlertTitle>
              <AlertDescription>{t('branding.savedDescription')}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-2">
            <Label htmlFor="branding-name">{t('branding.workspaceName')}</Label>
            <Input
              id="branding-name"
              minLength={2}
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="branding-logo">{t('branding.logoUrl')}</Label>
            <Input
              id="branding-logo"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://cdn.example.com/logo.svg"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="branding-favicon">{t('branding.faviconUrl')}</Label>
            <Input
              id="branding-favicon"
              type="url"
              value={faviconUrl}
              onChange={(e) => setFaviconUrl(e.target.value)}
              placeholder="https://cdn.example.com/favicon.ico"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="branding-primary">{t('branding.primaryColor')}</Label>
              <Input
                id="branding-primary"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                placeholder="#4f46e5"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="branding-secondary">{t('branding.secondaryColor')}</Label>
              <Input
                id="branding-secondary"
                value={secondary}
                onChange={(e) => setSecondary(e.target.value)}
                placeholder="#10b981"
              />
            </div>
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? t('saving') : t('branding.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
