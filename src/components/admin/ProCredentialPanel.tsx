import Link from 'next/link';
import { FileText, RotateCcw } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ProLifecycleDetail } from '@/lib/data/pro-lifecycle-detail';
import { ProCredentialReviewForm } from './ProCredentialReviewForm';
import { ProCredentialStatusBadge } from './ProLifecycleStatusBadge';

type Credential = ProLifecycleDetail['credentials'][number];
type Evidence = ProLifecycleDetail['evidence'][number];
export type ProCredentialSourceState =
  | { kind: 'ready'; credentials: Credential[]; evidence: Evidence[] }
  | { kind: 'error' };

function formatDate(value: string | null, locale: string, unavailable: string): string {
  if (!value) return unavailable;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AE' : 'en-AE', {
    dateStyle: 'medium',
    timeZone: 'Asia/Dubai',
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function CredentialRecord({
  userId,
  credential,
  evidence,
}: {
  userId: string;
  credential: Credential;
  evidence: Evidence[];
}) {
  const tPromise = getTranslations('admin.user.proLifecycle');
  const localePromise = getLocale();
  return Promise.all([tPromise, localePromise]).then(([t, locale]) => {
    return (
      <section className="space-y-4 border-t pt-4 first:border-t-0 first:pt-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium">
            {t('credential.version', { version: credential.version })}
          </h3>
          <ProCredentialStatusBadge
            state={credential.state}
            label={t(`credentialStates.${credential.state}`)}
          />
        </div>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground text-xs">{t('credential.identifier')}</dt>
            <dd className="mt-1 font-mono text-sm" dir="ltr">
              {credential.maskedIdentifier ?? t('unavailable')}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">{t('credential.authority')}</dt>
            <dd className="mt-1 text-sm">{credential.issuingAuthority ?? t('unavailable')}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">{t('credential.issueDate')}</dt>
            <dd className="mt-1 text-sm" dir="ltr">
              {formatDate(credential.issueDate, locale, t('unavailable'))}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">{t('credential.expiryDate')}</dt>
            <dd className="mt-1 text-sm" dir="ltr">
              {formatDate(credential.expiryDate, locale, t('unavailable'))}
            </dd>
          </div>
        </dl>
        <div>
          <h4 className="text-sm font-medium">{t('credential.evidenceTitle')}</h4>
          {evidence.length ? (
            <ul className="mt-2 space-y-2">
              {evidence.map((item) => (
                <li key={item.evidenceId}>
                  <a
                    className="focus-visible:ring-ring inline-flex min-h-11 items-center gap-2 rounded-md underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
                    href={`/api/v1/account/pro/credentials/evidence/${item.evidenceId}`}
                  >
                    <FileText aria-hidden className="size-4" />
                    {item.originalNameSafe}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-2 text-sm">{t('credential.noEvidence')}</p>
          )}
        </div>
        <ProCredentialReviewForm
          key={`${credential.credentialId}-${credential.state}-${credential.version}`}
          userId={userId}
          credentialId={credential.credentialId}
          state={credential.state}
          version={credential.version}
        />
      </section>
    );
  });
}

export async function ProCredentialPanel({
  userId,
  credentials,
  evidence,
  sourceState,
}: {
  userId: string;
  credentials: ProLifecycleDetail['credentials'];
  evidence: ProLifecycleDetail['evidence'];
  sourceState?: ProCredentialSourceState;
}) {
  const t = await getTranslations('admin.user.proLifecycle');
  const resolved = sourceState ?? { kind: 'ready', credentials, evidence };
  if (resolved.kind === 'error') {
    return (
      <Card className="border-[var(--lifecycle-border)] bg-[var(--lifecycle-surface)]">
        <CardHeader>
          <CardTitle>
            <h2>{t('credential.title')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
            {t('credential.loadError')}
          </p>
          <Button asChild variant="outline" className="min-h-11">
            <Link href={`/admin/users/${userId}`}>
              <RotateCcw aria-hidden />
              {t('credential.retry')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('credential.title')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {resolved.credentials.length ? (
          resolved.credentials.map((credential) => (
            <CredentialRecord
              key={credential.credentialId}
              userId={userId}
              credential={credential}
              evidence={resolved.evidence.filter(
                (item) => item.credentialId === credential.credentialId,
              )}
            />
          ))
        ) : (
          <p className="text-muted-foreground text-sm">{t('credential.empty')}</p>
        )}
      </CardContent>
    </Card>
  );
}
