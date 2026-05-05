'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { createClientAction } from '@/app/(tenant)/t/[tenant]/(pro)/clients/actions';

export function CreateClientForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [tradeLicense, setTradeLicense] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');

  function reset() {
    setCompanyName('');
    setTradeLicense('');
    setJurisdiction('');
    setLicenseExpiry('');
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createClientAction(slug, {
        company_name: companyName,
        trade_license_no: tradeLicense,
        jurisdiction,
        license_expiry: licenseExpiry,
      });
      if (!result.ok) {
        setError(`${result.code}: ${result.error}`);
        return;
      }
      reset();
      setOpen(false);
      router.push(`/t/${slug}/clients/${result.data.id}`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>Add client</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a new client</DialogTitle>
          <DialogDescription>
            Capture the basics now — license, shareholders, and documents can be filled in later.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Could not add client</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-2">
            <Label htmlFor="client-name">Company name</Label>
            <Input
              id="client-name"
              required
              minLength={2}
              maxLength={200}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Trading LLC"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="client-license">Trade license #</Label>
            <Input
              id="client-license"
              maxLength={64}
              value={tradeLicense}
              onChange={(e) => setTradeLicense(e.target.value)}
              placeholder="DED-123456"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="client-jurisdiction">Jurisdiction</Label>
            <Input
              id="client-jurisdiction"
              maxLength={120}
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
              placeholder="Dubai Mainland"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="client-expiry">License expiry</Label>
            <Input
              id="client-expiry"
              type="date"
              value={licenseExpiry}
              onChange={(e) => setLicenseExpiry(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Adding…' : 'Add client'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
