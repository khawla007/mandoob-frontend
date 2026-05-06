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
import { updateClientAction } from '@/app/(tenant)/t/[tenant]/(pro)/clients/actions';

export function EditClientForm({
  slug,
  client,
}: {
  slug: string;
  client: {
    id: string;
    company_name: string;
    trade_license_no: string | null;
    jurisdiction: string | null;
    license_expiry: string | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState(client.company_name);
  const [tradeLicense, setTradeLicense] = useState(client.trade_license_no ?? '');
  const [jurisdiction, setJurisdiction] = useState(client.jurisdiction ?? '');
  const [licenseExpiry, setLicenseExpiry] = useState(client.license_expiry ?? '');

  function reset() {
    setCompanyName(client.company_name);
    setTradeLicense(client.trade_license_no ?? '');
    setJurisdiction(client.jurisdiction ?? '');
    setLicenseExpiry(client.license_expiry ?? '');
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateClientAction(slug, client.id, {
        company_name: companyName,
        trade_license_no: tradeLicense,
        jurisdiction,
        license_expiry: licenseExpiry,
      });
      if (!result.ok) {
        setError(`${result.code}: ${result.error}`);
        return;
      }
      setOpen(false);
      router.refresh();
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
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
          <DialogDescription>
            Update the client&apos;s basic info. Documents and renewals are managed in their own
            tabs.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Could not save changes</AlertTitle>
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
              {pending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
