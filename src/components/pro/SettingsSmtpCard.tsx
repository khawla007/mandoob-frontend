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
import { updateSmtpAction } from '@/app/(tenant)/t/[tenant]/(pro)/settings/actions';
import type { TenantSmtpRedacted } from '@/lib/data/tenant-settings';
import { deriveProviderState } from '@/lib/settings/provider-state';

export function SettingsSmtpCard({
  slug,
  initial,
  initialVersion,
}: {
  slug: string;
  initial: TenantSmtpRedacted;
  initialVersion: number;
}) {
  const t = useTranslations('pro.settings');
  const [expected_version, setExpectedVersion] = useState(initialVersion);
  const operation = useRef<SettingsOperation | null>(null);
  const [stored, setStored] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [host, setHost] = useState(initial?.host ?? '');
  const [port, setPort] = useState(String(initial?.port ?? '587'));
  const [username, setUsername] = useState(initial?.username ?? '');
  const [password, setPassword] = useState('');
  const [fromAddress, setFromAddress] = useState(initial?.from_address ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  const passwordPlaceholder = stored?.has_password
    ? t('smtp.passwordKeepPlaceholder')
    : t('smtp.passwordPlaceholder');
  const status = deriveProviderState({
    status: 'ready',
    data: stored && { enabled: stored.enabled, hasCredential: stored.has_password },
  });

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
        const r = await updateSmtpAction(slug, {
          ...operation.current,
          host,
          port,
          username,
          password,
          from_address: fromAddress,
          enabled,
        });
        if (!r.ok) {
          setError(t(`actionErrors.${r.errorKey}`));
          return;
        }
        setSaved(true);
        setPassword('');
        setExpectedVersion(r.data.version);
        operation.current = null;
        setStored({
          host,
          port: Number(port),
          username,
          from_address: fromAddress,
          enabled,
          has_password: true,
        });
      } catch {
        setError(t('actionErrors.saveFailed'));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{t('smtp.title')}</CardTitle>
            <CardDescription>{t('smtp.description')}</CardDescription>
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
                <AlertDescription>{t('smtp.savedDescription')}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <div className="grid gap-2">
                <Label htmlFor="smtp-host">{t('smtp.host')}</Label>
                <Input
                  id="smtp-host"
                  required
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="smtp.example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="smtp-port">{t('smtp.port')}</Label>
                <Input
                  id="smtp-port"
                  type="number"
                  min={1}
                  max={65535}
                  required
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="smtp-username">{t('smtp.username')}</Label>
              <Input
                id="smtp-username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="smtp-password">{t('smtp.password')}</Label>
              <Input
                id="smtp-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={passwordPlaceholder}
                autoComplete="new-password"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="smtp-from">{t('smtp.fromAddress')}</Label>
              <Input
                id="smtp-from"
                type="email"
                required
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
                placeholder="no-reply@acmepro.ae"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="smtp-enabled"
                checked={enabled}
                onCheckedChange={(v) => {
                  operation.current = null;
                  setSaved(false);
                  setEnabled(v === true);
                }}
              />
              <Label htmlFor="smtp-enabled" className="font-normal">
                {t('enabled')}
              </Label>
            </div>

            <Button type="submit" disabled={pending}>
              {pending ? t('saving') : t('smtp.save')}
            </Button>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}
