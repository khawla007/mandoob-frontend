import { getLocale, getTranslations } from 'next-intl/server';
import { AlertCircle, BadgeCheck, Ban, Clock3, FilePenLine, Send, ShieldX } from 'lucide-react';

import { ProCredentialForm } from '@/components/account/ProCredentialForm';
import { ProCredentialEvidenceForm } from '@/components/account/ProCredentialEvidenceForm';
import type { ReadSelfProCredentialSnapshot } from '@/lib/data/account-self';
import type { ProCredentialState } from '@/lib/pro-lifecycle/contracts';

const stateIcons = {
  draft: FilePenLine,
  submitted: Send,
  under_review: Clock3,
  verified: BadgeCheck,
  rejected: ShieldX,
  expired: AlertCircle,
  revoked: Ban,
} satisfies Record<ProCredentialState, typeof FilePenLine>;

function formatDate(value: string | null, locale: string, empty: string): string {
  if (!value) return empty;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AE' : 'en-AE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Dubai',
  }).format(new Date(`${value}T12:00:00.000Z`));
}

export async function ProCredentialPanel({
  snapshot,
  unavailable,
}: {
  snapshot: ReadSelfProCredentialSnapshot | null;
  unavailable: boolean;
}) {
  const [t, locale] = await Promise.all([getTranslations('account.proCredential'), getLocale()]);
  if (unavailable || !snapshot) {
    return (
      <section
        className="border-border bg-card rounded-xl border p-5"
        aria-labelledby="credential-heading"
      >
        <h2 id="credential-heading" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p role="status" className="text-muted-foreground mt-2 text-sm">
          {t('unavailable')}
        </p>
      </section>
    );
  }

  const credential = snapshot.credentials[0] ?? null;
  const Icon = credential ? stateIcons[credential.state] : FilePenLine;
  const credentialEvidence = credential
    ? snapshot.evidence.filter((item) => item.credentialId === credential.credentialId)
    : [];
  const editable = credential?.state === 'draft';
  const terminal =
    credential?.state === 'rejected' ||
    credential?.state === 'expired' ||
    credential?.state === 'revoked';
  const reason =
    credential?.state === 'rejected' && snapshot.latestDecision?.eventKind === 'credential_rejected'
      ? snapshot.latestDecision.reason
      : null;

  return (
    <section
      className="border-border bg-card space-y-5 rounded-xl border p-5"
      aria-labelledby="credential-heading"
    >
      <div className="space-y-1">
        <h2 id="credential-heading" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </div>

      {!credential ? (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
          <ProCredentialForm mode="create" credential={null} />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Icon aria-hidden className="size-4" />
            {t(`states.${credential.state}`)}
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{t('identifier')}</dt>
              <dd dir="ltr" className="font-mono">
                {credential.maskedIdentifier ?? t('notProvided')}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('issuingAuthority')}</dt>
              <dd>{credential.issuingAuthority ?? t('notProvided')}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('issueDate')}</dt>
              <dd dir="ltr">{formatDate(credential.issueDate, locale, t('notProvided'))}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('expiryDate')}</dt>
              <dd dir="ltr">{formatDate(credential.expiryDate, locale, t('notProvided'))}</dd>
            </div>
          </dl>
          {reason ? (
            <div className="bg-destructive/5 rounded-lg p-3 text-sm">
              <p className="font-medium">{t('rejectedReason')}</p>
              <p className="mt-1">{reason}</p>
            </div>
          ) : null}
          {editable ? (
            <div className="space-y-6">
              <ProCredentialForm mode="edit" credential={credential} />
              <div className="border-border border-t pt-5">
                <h3 className="mb-3 font-medium">{t('evidenceTitle')}</h3>
                <ProCredentialEvidenceForm
                  key={`${credential.credentialId}-${credential.version}`}
                  credentialId={credential.credentialId}
                  version={credential.version}
                  evidence={credentialEvidence}
                  locale={locale}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="font-medium">{t('evidenceTitle')}</h3>
              {credentialEvidence.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('noEvidence')}</p>
              ) : (
                <ul className="space-y-2">
                  {credentialEvidence.map((evidence) => (
                    <li key={evidence.evidenceId}>
                      <a
                        className="text-primary underline-offset-4 hover:underline"
                        href={`/api/v1/account/pro/credentials/evidence/${evidence.evidenceId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {evidence.originalNameSafe}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {terminal ? <ProCredentialForm mode="replacement" credential={credential} /> : null}
        </>
      )}
    </section>
  );
}
