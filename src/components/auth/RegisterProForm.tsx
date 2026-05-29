'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { postJson } from '@/lib/http/post';
import { TENANT_PLANS } from '@/lib/validation/tenant-onboarding';

export function RegisterProForm() {
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
          setError(`${body.code ?? 'ERROR'}: ${body.error ?? 'Could not submit'}`);
        } catch {
          setError(`HTTP ${res.status}: Could not submit`);
        }
        setPending(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError('ERROR: Could not submit');
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <Alert>
        <AlertTitle>Submitted</AlertTitle>
        <AlertDescription>
          Your PRO firm signup is awaiting approval. We&apos;ll email{' '}
          <span className="font-mono">{adminEmail}</span> when an admin reviews it. Until then, your
          tenant is in pending status.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not submit</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Firm</h2>
        <div className="grid gap-2">
          <Label htmlFor="firm-name">Firm name</Label>
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
          <Label htmlFor="firm-plan">Plan</Label>
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
        <h2 className="text-base font-semibold">Your account</h2>
        <div className="grid gap-2">
          <Label htmlFor="admin-name">Full name</Label>
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
          <Label htmlFor="admin-email">Email</Label>
          <Input
            id="admin-email"
            type="email"
            required
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="admin-phone">Phone (E.164)</Label>
          <Input
            id="admin-phone"
            required
            placeholder="+971501234567"
            value={adminPhone}
            onChange={(e) => setAdminPhone(e.target.value)}
          />
        </div>
      </section>

      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Submitting…
          </>
        ) : (
          'Submit for review'
        )}
      </Button>
    </form>
  );
}
