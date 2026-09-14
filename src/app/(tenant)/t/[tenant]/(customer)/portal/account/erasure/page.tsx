import { ShieldAlert } from 'lucide-react';
import { requireTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { getActiveErasureRequestForSubject } from '@/lib/data/erasure';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { requestErasureAction } from './actions';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function CustomerErasurePage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ verified?: string }>;
}) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const { tenant, session } = await requireTenantRouteAccess(slug, [
    'customer',
    'admin',
    'super_admin',
  ]);
  const t = await getTranslations('customer.erasure');

  const active = await getActiveErasureRequestForSubject(session.id);
  const submitted = sp.verified === '1';
  const verifyFailed = sp.verified === 'failed' || sp.verified === 'missing';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('description')}</p>
      </div>

      {submitted && (
        <Card className="signal-status signal-status--success">
          <CardContent className="py-4 text-sm" role="status">
            {t('verified')}
          </CardContent>
        </Card>
      )}
      {verifyFailed && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="text-destructive py-4 text-sm">
            {t('verificationFailed')}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert className="size-5" />
            {t('afterApproval')}
          </CardTitle>
          <CardDescription>{t('afterApprovalDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-medium">{t('erasedTitle')}</h2>
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
              <li>{t('erasedProfile')}</li>
              <li>{t('erasedIdentity')}</li>
              <li>{t('erasedDocuments')}</li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-medium">{t('retainedTitle')}</h2>
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
              <li>{t('retainedFinance')}</li>
              <li>{t('retainedAudit')}</li>
              <li>{t('retainedRegistration')}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('submitTitle')}</CardTitle>
          <CardDescription>{t('submitDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {active ? (
            <div className="text-sm">
              {t('activeRequest', { status: t(`statuses.${active.status}`) })}
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
                <Label htmlFor="recoveryEmail">{t('recoveryEmail')}</Label>
                <Input
                  id="recoveryEmail"
                  name="recoveryEmail"
                  type="email"
                  defaultValue={session.email ?? ''}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">{t('reason')}</Label>
                <Textarea
                  id="reason"
                  name="reason"
                  maxLength={1000}
                  placeholder={t('optional')}
                  rows={4}
                />
              </div>
              <Button type="submit">{t('sendVerification')}</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
