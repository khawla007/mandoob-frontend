'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { postJson } from '@/lib/http/post';
import { claimFormSubmission, releaseFormSubmission } from './form-submission-guard';

export function VerifyProCredentialsButton({
  userId,
  verified,
  expectedUpdatedAt,
}: {
  userId: string;
  verified: boolean;
  expectedUpdatedAt: string;
}) {
  const t = useTranslations('admin.user.credentials');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<'generic' | 'stale' | null>(null);
  const submissionLatch = useRef(false);

  async function verify() {
    if (verified || completed || !claimFormSubmission(submissionLatch)) return;
    let succeeded = false;
    setPending(true);
    setError(null);
    try {
      const response = await postJson(`/api/v1/admin/users/${userId}/credentials`, {
        expectedUpdatedAt,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { code?: unknown } | null;
        const stale = payload?.code === 'STALE_CREDENTIALS';
        setError(stale ? 'stale' : 'generic');
        if (stale) router.refresh();
        return;
      }
      succeeded = true;
      setCompleted(true);
      router.refresh();
    } catch {
      setError('generic');
    } finally {
      if (!succeeded) releaseFormSubmission(submissionLatch);
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={verify}
        disabled={pending || verified || completed}
        aria-disabled={pending || verified || completed}
        aria-busy={pending}
      >
        {verified || completed ? t('verified') : pending ? t('verifying') : t('verify')}
      </Button>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {t(error === 'stale' ? 'staleError' : 'error')}
        </p>
      ) : null}
    </div>
  );
}
