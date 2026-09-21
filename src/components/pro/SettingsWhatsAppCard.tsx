'use client';

import { useRef, useState, useTransition } from 'react';
import { prepareSettingsOperation, type SettingsOperation } from './settings-operation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { updateWhatsAppAction } from '@/app/(tenant)/t/[tenant]/(pro)/settings/actions';
import type { TenantWhatsAppRedacted } from '@/lib/data/tenant-settings';
import { deriveProviderState } from '@/lib/settings/provider-state';

export function SettingsWhatsAppCard({
  slug,
  initial,
  initialVersion,
}: {
  slug: string;
  initial: TenantWhatsAppRedacted;
  initialVersion: number;
}) {
  const t = useTranslations('pro.settings');
  const [expected_version, setExpectedVersion] = useState(initialVersion);
  const operation = useRef<SettingsOperation | null>(null);
  const [stored, setStored] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [phoneNumberId, setPhoneNumberId] = useState(initial?.phone_number_id ?? '');
  const [businessAccountId, setBusinessAccountId] = useState(initial?.business_account_id ?? '');
  const [accessToken, setAccessToken] = useState('');
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const hasExistingToken = Boolean(stored?.has_access_token);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    operation.current = prepareSettingsOperation(operation.current, expected_version, () =>
      crypto.randomUUID(),
    );
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const r = await updateWhatsAppAction(slug, {
          ...operation.current,
          phone_number_id: phoneNumberId,
          business_account_id: businessAccountId,
          access_token: accessToken,
          enabled,
        });
        if (!r.ok) {
          setError(t(`actionErrors.${r.errorKey}`));
          return;
        }
        setSaved(true);
        setAccessToken('');
        setExpectedVersion(r.data.version);
        operation.current = null;
        setStored({
          phone_number_id: phoneNumberId,
          business_account_id: businessAccountId,
          enabled,
          has_access_token: true,
        });
      } catch {
        setError(t('actionErrors.saveFailed'));
      }
    });
  }

  const status = deriveProviderState({
    status: 'ready',
    data: stored && { enabled: stored.enabled, hasCredential: stored.has_access_token },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{t('whatsapp.title')}</CardTitle>
            <CardDescription>{t('whatsapp.description')}</CardDescription>
          </div>
          <Badge variant={status === 'enabled' ? 'default' : 'secondary'}>
            {t(`providerStatus.${status}`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={onSubmit}
          onChange={() => {
            operation.current = null;
            setSaved(false);
          }}
        >
          <fieldset disabled={pending} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertTitle>{t('couldNotSave')}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {saved && (
              <Alert>
                <AlertTitle>{t('saved')}</AlertTitle>
                <AlertDescription>{t('whatsapp.savedDescription')}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="wa-phone-number-id">{t('whatsapp.phoneNumberId')}</Label>
                <Input
                  id="wa-phone-number-id"
                  required
                  inputMode="numeric"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wa-business-account-id">{t('whatsapp.businessAccountId')}</Label>
                <Input
                  id="wa-business-account-id"
                  required
                  inputMode="numeric"
                  value={businessAccountId}
                  onChange={(e) => setBusinessAccountId(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="wa-token">{t('whatsapp.accessToken')}</Label>
              <Input
                id="wa-token"
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={
                  hasExistingToken
                    ? t('whatsapp.tokenStoredPlaceholder')
                    : t('whatsapp.tokenPlaceholder')
                }
                autoComplete="new-password"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="wa-enabled"
                checked={enabled}
                onCheckedChange={(v) => {
                  operation.current = null;
                  setSaved(false);
                  setEnabled(v === true);
                }}
              />
              <Label htmlFor="wa-enabled" className="font-normal">
                {t('enabled')}
              </Label>
            </div>

            <Button type="submit" disabled={pending}>
              {pending ? t('saving') : t('whatsapp.save')}
            </Button>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}
