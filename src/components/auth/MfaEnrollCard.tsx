'use client';
import { postJson } from '@/lib/http/post';
import { sharedSafeDestination } from '@/lib/auth/safe-redirect';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

type Enroll = { factorId: string; qrCode: string; secret: string };
type BusyState = 'starting' | 'verifying' | 'cancelling' | null;

function enrollmentErrorKey(code: unknown): string {
  if (code === 'RATE_LIMITED') return 'mfaEnrollmentRateLimited';
  return 'mfaEnrollmentFailed';
}

export function MfaEnrollCard({
  challengeRequired = false,
  enrollmentUnavailable = false,
}: {
  challengeRequired?: boolean;
  enrollmentUnavailable?: boolean;
}) {
  const t = useTranslations('auth');
  const tEnrollment = useTranslations('auth.mfa.enroll');
  const tErrors = useTranslations('errors');
  const inFlight = useRef(false);
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyState>(null);
  const [needsChallenge, setNeedsChallenge] = useState(challengeRequired);
  const [cleanupBlocked, setCleanupBlocked] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [finalizationFailure, setFinalizationFailure] = useState<
    'repairRequired' | 'cleanRollback' | null
  >(null);

  async function cleanupFactor(factorId: string): Promise<boolean> {
    try {
      const { error: cleanupError } = await getSupabaseBrowserClient().auth.mfa.unenroll({
        factorId: factorId,
      });
      return !cleanupError;
    } catch {
      return false;
    }
  }

  async function onStartEnrollment() {
    if (inFlight.current || cleanupBlocked || needsChallenge) return;
    inFlight.current = true;
    setBusy('starting');
    setError(null);
    setNotice(null);
    try {
      const res = await postJson('/api/v1/auth/mfa/enroll', {});
      const data = (await res.json().catch(() => null)) as {
        code?: unknown;
        factorId?: unknown;
        qrCode?: unknown;
        secret?: unknown;
      } | null;
      if (!res.ok) {
        if (data?.code === 'AAL2_REQUIRED' || data?.code === 'MFA_ALREADY_ENROLLED') {
          setNeedsChallenge(true);
          return;
        }
        setError(tErrors(enrollmentErrorKey(data?.code)));
        return;
      }
      if (
        typeof data?.factorId !== 'string' ||
        data.factorId.length === 0 ||
        typeof data.qrCode !== 'string' ||
        typeof data.secret !== 'string'
      ) {
        if (typeof data?.factorId !== 'string' || data.factorId.length === 0) {
          setCleanupBlocked(true);
          setError(tErrors('mfaEnrollmentStateUncertain'));
          return;
        }
        if (!(await cleanupFactor(data.factorId))) {
          setCleanupBlocked(true);
          setError(tErrors('mfaEnrollmentCleanupFailed'));
          return;
        }
        setError(tErrors('mfaEnrollmentFailed'));
        return;
      }
      setEnroll({ factorId: data.factorId, qrCode: data.qrCode, secret: data.secret });
    } catch {
      setCleanupBlocked(true);
      setError(tErrors('mfaEnrollmentStateUncertain'));
    } finally {
      setBusy(null);
      inFlight.current = false;
    }
  }

  const startEnrollment = onStartEnrollment;

  async function copyRecoveryCodes() {
    if (!recoveryCodes) return;
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setNotice(tEnrollment('states.copied'));
    } catch {
      setNotice(tEnrollment('states.copyFailure'));
    }
  }

  function continueAfterRecovery() {
    if (!acknowledged) return;
    const rawNext = new URLSearchParams(window.location.search).get('next');
    window.location.assign(sharedSafeDestination(rawNext));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const code = new FormData(e.currentTarget).get('code');
    if (!enroll) return;
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy('verifying');
    (async () => {
      try {
        const res = await postJson('/api/v1/auth/mfa/verify', {
          factorId: enroll.factorId,
          code,
          context: 'enroll',
        });
        const data = (await res.json().catch(() => null)) as {
          code?: unknown;
          recoveryCodes?: unknown;
        } | null;
        if (!res.ok) {
          if (data?.code === 'MFA_ENROLL_REPAIR_REQUIRED') {
            setEnroll(null);
            setFinalizationFailure('repairRequired');
            return;
          }
          if (data?.code === 'MFA_ENROLL_FINALIZATION_FAILED') {
            setEnroll(null);
            setFinalizationFailure('cleanRollback');
            return;
          }
          if (data?.code === 'AAL2_REQUIRED') {
            if (!(await cleanupFactor(enroll.factorId))) {
              setCleanupBlocked(true);
              setError(tErrors('mfaEnrollmentCleanupFailed'));
              return;
            }
            setEnroll(null);
            setNeedsChallenge(true);
            return;
          }
          if (data?.code === 'MFA_CHALLENGE_FAILED') {
            if (!(await cleanupFactor(enroll.factorId))) {
              setCleanupBlocked(true);
              setError(tErrors('mfaEnrollmentCleanupFailed'));
              return;
            }
            setEnroll(null);
            setError(tErrors('mfaEnrollmentFailed'));
            return;
          }
          setError(tErrors('verificationFailed'));
          return;
        }
        if (
          !Array.isArray(data?.recoveryCodes) ||
          data.recoveryCodes.length === 0 ||
          !data.recoveryCodes.every((item) => typeof item === 'string')
        ) {
          setCleanupBlocked(true);
          setError(tErrors('mfaEnrollmentStateUncertain'));
          return;
        }
        setEnroll(null);
        setRecoveryCodes(data.recoveryCodes);
      } catch {
        setCleanupBlocked(true);
        setError(tErrors('mfaEnrollmentStateUncertain'));
      } finally {
        setBusy(null);
        inFlight.current = false;
      }
    })();
  }

  async function cancelEnrollment() {
    if (!enroll || inFlight.current) return;
    inFlight.current = true;
    setBusy('cancelling');
    setError(null);
    try {
      if (!(await cleanupFactor(enroll.factorId))) {
        setCleanupBlocked(true);
        setError(tErrors('mfaEnrollmentCleanupFailed'));
        return;
      }
      setEnroll(null);
      setNotice(t('mfaEnrollmentCancelled'));
    } finally {
      setBusy(null);
      inFlight.current = false;
    }
  }

  if (recoveryCodes) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">{t('longCopy.recoveryCodesIntro')}</p>
        <pre className="bg-muted text-foreground rounded p-3 font-mono text-sm">
          {recoveryCodes.join('\n')}
        </pre>
        <button
          type="button"
          onClick={copyRecoveryCodes}
          className="btn btn--secondary w-full justify-center"
        >
          {tEnrollment('copy')}
        </button>
        <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
          {notice}
        </p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.currentTarget.checked)}
          />
          <span>{tEnrollment('acknowledge')}</span>
        </label>
        <button
          type="button"
          disabled={!acknowledged}
          onClick={continueAfterRecovery}
          className="btn btn--accent w-full justify-center"
        >
          {t('recoveryCodesSaved')}
        </button>
      </div>
    );
  }

  if (cleanupBlocked) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {error ?? tErrors('mfaEnrollmentStateUncertain')}
      </p>
    );
  }

  if (finalizationFailure) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-destructive text-sm">
          {tEnrollment(`states.${finalizationFailure}` as never)}
        </p>
        <Link href="/login" className="btn btn--secondary w-full justify-center">
          {tEnrollment('signIn')}
        </Link>
        {finalizationFailure === 'repairRequired' ? (
          <Link href="/contact" className="btn btn--secondary w-full justify-center">
            {tEnrollment('contactSupport')}
          </Link>
        ) : null}
      </div>
    );
  }

  if (!enroll) {
    if (enrollmentUnavailable) {
      return (
        <p role="alert" className="text-muted-foreground text-sm">
          {t('mfaEnrollmentUnavailable')}
        </p>
      );
    }
    if (needsChallenge) {
      return (
        <div className="space-y-3">
          <p role="alert" className="text-muted-foreground text-sm">
            {t('mfaChallengeRequired')}
          </p>
          <Link
            href="/mfa/challenge"
            className="btn btn--authenticated-accent w-full justify-center"
          >
            {t('completeMfaChallenge')}
          </Link>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">{t('mfaEnrollmentReady')}</p>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-muted-foreground text-sm">
            {notice}
          </p>
        )}
        {!cleanupBlocked && (
          <button
            type="button"
            disabled={busy === 'starting'}
            aria-busy={busy === 'starting'}
            onClick={startEnrollment}
            className="bg-primary text-primary-foreground focus-visible:ring-ring min-h-11 w-full rounded-lg px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
          >
            {busy === 'starting' ? t('startingMfaSetup') : t('startMfaSetup')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Supabase returns the QR as an SVG data URL */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enroll.qrCode} alt={t('totpQrAlt')} className="mx-auto h-44 w-44" />
      <details className="text-muted-foreground text-xs">
        <summary>{t('cannotScan')}</summary>
        <code className="mt-1 block break-all">{enroll.secret}</code>
      </details>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t('twoFactorCode')}</span>
          <input
            name="code"
            inputMode="numeric"
            required
            className="focus-visible:border-ring focus-visible:ring-ring min-h-11 w-full rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
        </label>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy !== null}
          aria-busy={busy === 'verifying'}
          className="btn btn--accent w-full justify-center disabled:opacity-50"
        >
          {busy === 'verifying' ? t('verifying') : t('enableTwoFactor')}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          aria-busy={busy === 'cancelling'}
          onClick={cancelEnrollment}
          className="btn btn--secondary w-full justify-center"
        >
          {busy === 'cancelling' ? t('cancellingMfaSetup') : t('cancelMfaSetup')}
        </button>
      </form>
    </div>
  );
}
