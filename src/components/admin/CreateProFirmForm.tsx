'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function CreateProFirmForm() {
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
    if (!slugTouched) setSlug(slugify(v));
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
          <AlertTitle>Could not create PRO firm</AlertTitle>
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
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Acme PRO Services"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="firm-slug">Slug</Label>
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
          <p className="text-muted-foreground text-xs">
            Lowercase letters, digits, hyphens. 3–40 chars. Used in URLs.
          </p>
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
        <h2 className="text-base font-semibold">Initial PRO admin</h2>
        <p className="text-muted-foreground text-xs">
          A Supabase invite email will be sent. The admin updates license info via /account/role
          after first login.
        </p>
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

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create PRO firm'}
        </Button>
      </div>
    </form>
  );
}
