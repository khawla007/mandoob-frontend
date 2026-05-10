import { ShieldAlert } from 'lucide-react';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/require-role';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { getActiveErasureRequestForSubject } from '@/lib/data/erasure';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { requestErasureAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function CustomerErasurePage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ verified?: string }>;
}) {
  const session = await requireRole('customer', 'super_admin');
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const active = await getActiveErasureRequestForSubject(session.id);
  const submitted = sp.verified === '1';
  const verifyFailed = sp.verified === 'failed' || sp.verified === 'missing';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Data erasure</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Request deletion of direct personal data from your customer account.
        </p>
      </div>

      {submitted && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="py-4 text-sm text-emerald-900">
            Your request was verified and sent for admin review.
          </CardContent>
        </Card>
      )}
      {verifyFailed && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="text-destructive py-4 text-sm">
            The verification link is invalid or expired.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert className="size-5" />
            What happens after approval
          </CardTitle>
          <CardDescription>
            Mandoob removes direct personal identifiers while preserving legal records.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-medium">Erased or anonymized</h2>
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
              <li>Name, phone, username, and profile details</li>
              <li>Passport and identity-number fields</li>
              <li>Uploaded passport, visa, Emirates ID, and shareholder ID documents</li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-medium">Retained</h2>
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
              <li>Invoices, payments, and legally required business records</li>
              <li>Audit-log events under platform administrator lock</li>
              <li>Non-PII company registration history</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Submit erasure request</CardTitle>
          <CardDescription>
            A verification email is sent before administrators can review the request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {active ? (
            <div className="text-sm">
              Active request {active.id} is currently {active.status.replaceAll('_', ' ')}.
            </div>
          ) : (
            <form
              className="space-y-4"
              action={async (formData) => {
                'use server';
                await requestErasureAction(tenant.slug, formData);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="recoveryEmail">Recovery email</Label>
                <Input
                  id="recoveryEmail"
                  name="recoveryEmail"
                  type="email"
                  defaultValue={session.email ?? ''}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Reason</Label>
                <Textarea
                  id="reason"
                  name="reason"
                  maxLength={1000}
                  placeholder="Optional"
                  rows={4}
                />
              </div>
              <Button type="submit">Send verification email</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
