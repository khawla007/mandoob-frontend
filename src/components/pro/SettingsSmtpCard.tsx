'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { updateSmtpAction } from '@/app/(tenant)/t/[tenant]/(pro)/settings/actions';
import type { TenantSmtpRedacted } from '@/lib/data/tenant-settings';

export function SettingsSmtpCard({ slug, initial }: { slug: string; initial: TenantSmtpRedacted }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [host, setHost] = useState(initial?.host ?? '');
  const [port, setPort] = useState(String(initial?.port ?? '587'));
  const [username, setUsername] = useState(initial?.username ?? '');
  const [password, setPassword] = useState('');
  const [fromAddress, setFromAddress] = useState(initial?.from_address ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  const passwordPlaceholder = initial?.has_password
    ? '•••••••• (leave blank to keep)'
    : 'SMTP password';

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await updateSmtpAction(slug, {
        host,
        port,
        username,
        password,
        from_address: fromAddress,
        enabled,
      });
      if (!r.ok) {
        setError(`${r.code}: ${r.error}`);
        return;
      }
      setSaved(true);
      setPassword('');
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">SMTP</CardTitle>
        <CardDescription>
          Per-tenant outbound email server. Password is encrypted at rest (AES-256-GCM).
        </CardDescription>
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
              <AlertDescription>SMTP config updated.</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <div className="grid gap-2">
              <Label htmlFor="smtp-host">Host</Label>
              <Input
                id="smtp-host"
                required
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="smtp.example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="smtp-port">Port</Label>
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
            <Label htmlFor="smtp-username">Username</Label>
            <Input
              id="smtp-username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="smtp-password">Password</Label>
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
            <Label htmlFor="smtp-from">From address</Label>
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
              onCheckedChange={(v) => setEnabled(v === true)}
            />
            <Label htmlFor="smtp-enabled" className="font-normal">
              Enabled
            </Label>
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save SMTP config'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
