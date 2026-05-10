'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { updateWhatsAppAction } from '@/app/(tenant)/t/[tenant]/(pro)/settings/actions';
import type { TenantWhatsAppRedacted } from '@/lib/data/tenant-settings';

export function SettingsWhatsAppCard({
  slug,
  initial,
}: {
  slug: string;
  initial: TenantWhatsAppRedacted;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [phoneNumberId, setPhoneNumberId] = useState(initial?.phone_number_id ?? '');
  const [businessAccountId, setBusinessAccountId] = useState(initial?.business_account_id ?? '');
  const [accessToken, setAccessToken] = useState('');
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const hasExistingToken = Boolean(initial?.has_access_token);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await updateWhatsAppAction(slug, {
        phone_number_id: phoneNumberId,
        business_account_id: businessAccountId,
        access_token: accessToken,
        enabled,
        has_existing_token: hasExistingToken,
      });
      if (!r.ok) {
        setError(`${r.code}: ${r.error}`);
        return;
      }
      setSaved(true);
      setAccessToken('');
      router.refresh();
    });
  }

  const status = initial?.enabled && initial.has_access_token ? 'Connected' : initial ? 'Disabled' : 'Not configured';

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">WhatsApp</CardTitle>
            <CardDescription>Meta Cloud API credentials for tenant-owned messaging.</CardDescription>
          </div>
          <Badge variant={status === 'Connected' ? 'default' : 'secondary'}>{status}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Could not save</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {saved && (
            <Alert>
              <AlertTitle>Saved</AlertTitle>
              <AlertDescription>WhatsApp config updated.</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="wa-phone-number-id">Phone number ID</Label>
              <Input
                id="wa-phone-number-id"
                required
                inputMode="numeric"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wa-business-account-id">Business account ID</Label>
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
            <Label htmlFor="wa-token">Access token</Label>
            <Input
              id="wa-token"
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={hasExistingToken ? 'Token stored (leave blank to keep)' : 'Meta access token'}
              autoComplete="new-password"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="wa-enabled"
              checked={enabled}
              onCheckedChange={(v) => setEnabled(v === true)}
            />
            <Label htmlFor="wa-enabled" className="font-normal">
              Enabled
            </Label>
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? 'Saving...' : 'Save WhatsApp config'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
