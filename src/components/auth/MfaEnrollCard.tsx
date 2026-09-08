'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { sharedSafeDestination } from '@/lib/auth/safe-redirect';
import { postJson } from '@/lib/http/post';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { mfaFailureCategory, sanitizeMfaCode } from './mfa-state';

type Enroll = { factorId: string; qrCode: string; secret: string };
type State =
  | 'ready'
  | 'starting'
  | 'setup'
  | 'verifying'
  | 'recovery'
  | 'cancelling'
  | 'complete'
  | 'failure';

export function MfaEnrollCard() {
  const router = useRouter();
  const t = useTranslations('auth.mfa.enroll');
  const inFlight = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>('ready');
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [messageKey, setMessageKey] = useState<string | null>(null);

  function announce(key: string, nextState: State = 'failure') {
    setState(nextState);
    setMessageKey(key);
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }

  async function cleanupFactor(current: Enroll): Promise<boolean> {
    const { error } = await getSupabaseBrowserClient().auth.mfa.unenroll({
      factorId: current.factorId,
    });
    return !error;
  }

  async function onStart() {
    if (inFlight.current) return;
    inFlight.current = true;
    setState('starting');
    setMessageKey(null);
    try {
      if (enroll && !(await cleanupFactor(enroll))) return announce('states.cleanupFailure');
      setEnroll(null);
      const response = await postJson('/api/v1/auth/mfa/enroll', {});
      const data = (await response.json().catch(() => null)) as
        | (Partial<Enroll> & { code?: string })
        | null;
      if (
        !response.ok ||
        typeof data?.factorId !== 'string' ||
        typeof data.qrCode !== 'string' ||
        typeof data.secret !== 'string'
      ) {
        const category = mfaFailureCategory(data?.code);
        if (category === 'challengeRequired') return announce('states.challengeRequired');
        return announce(`states.${category}`);
      }
      setEnroll({ factorId: data.factorId, qrCode: data.qrCode, secret: data.secret });
      setCode('');
      setState('setup');
    } catch {
      announce('states.failure');
    } finally {
      inFlight.current = false;
    }
  }

  async function onCancel() {
    if (!enroll || inFlight.current) return;
    inFlight.current = true;
    setState('cancelling');
    setMessageKey(null);
    try {
      if (!(await cleanupFactor(enroll))) return announce('states.cleanupFailure');
      setEnroll(null);
      setCode('');
      announce('states.cancelled', 'ready');
    } catch {
      announce('states.cleanupFailure');
    } finally {
      inFlight.current = false;
    }
  }

  async function onVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enroll || inFlight.current) return;
    if (code.length < 6) return announce('states.invalidOrExpired', 'setup');
    inFlight.current = true;
    setState('verifying');
    setMessageKey(null);
    try {
      const response = await postJson('/api/v1/auth/mfa/verify', {
        factorId: enroll.factorId,
        code,
        context: 'enroll',
      });
      const data = (await response.json().catch(() => null)) as {
        code?: string;
        recoveryCodes?: unknown;
      } | null;
      if (!response.ok || !Array.isArray(data?.recoveryCodes)) {
        const category = mfaFailureCategory(data?.code);
        if (category === 'repairRequired') {
          setEnroll(null);
          return announce('states.repairRequired');
        }
        if (category === 'cleanRollback') {
          setEnroll(null);
          setCode('');
          return announce('states.cleanRollback');
        }
        if (category === 'challengeRequired') {
          setEnroll(null);
          setCode('');
          return announce('states.challengeRequired');
        }
        return announce(`states.${category}`, category === 'sessionExpired' ? 'failure' : 'setup');
      }
      setCode('');
      setEnroll(null);
      setRecoveryCodes(
        data.recoveryCodes.filter((item): item is string => typeof item === 'string'),
      );
      setState('recovery');
    } catch {
      announce('states.failure', 'setup');
    } finally {
      inFlight.current = false;
    }
  }

  async function onCopy() {
    if (!recoveryCodes) return;
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      announce('states.copied', 'recovery');
    } catch {
      announce('states.copyFailure', 'recovery');
    }
  }

  function onContinue() {
    if (!acknowledged) return;
    setState('complete');
    const rawNext = new URLSearchParams(window.location.search).get('next');
    router.replace(sharedSafeDestination(rawNext));
  }

  if (state === 'ready' || (state === 'failure' && !enroll)) {
    return (
      <div className="space-y-4" data-auth-state={state}>
        <p className="text-muted-foreground text-sm">{t('ready')}</p>
        {messageKey ? (
          <div ref={feedbackRef} role="alert" tabIndex={-1} className="text-destructive text-sm">
            {t(messageKey as never)}
          </div>
        ) : null}
        {messageKey !== 'states.repairRequired' &&
        messageKey !== 'states.cleanRollback' &&
        messageKey !== 'states.challengeRequired' ? (
          <button type="button" onClick={onStart} className="btn btn--accent w-full justify-center">
            {t(state === 'failure' ? 'retry' : 'start')}
          </button>
        ) : null}
        {messageKey === 'states.sessionExpired' ||
        messageKey === 'states.repairRequired' ||
        messageKey === 'states.cleanRollback' ? (
          <Link href="/login" className="btn btn--secondary w-full justify-center">
            {t('signIn')}
          </Link>
        ) : null}
        {messageKey === 'states.repairRequired' ? (
          <Link href="/contact" className="btn btn--secondary w-full justify-center">
            {t('contactSupport')}
          </Link>
        ) : null}
        {messageKey === 'states.challengeRequired' ? (
          <Link href="/mfa/challenge" className="btn btn--accent w-full justify-center">
            {t('completeChallenge')}
          </Link>
        ) : null}
      </div>
    );
  }

  if (state === 'starting')
    return (
      <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
        {t('starting')}
      </p>
    );

  if (recoveryCodes)
    return (
      <div className="space-y-4" data-auth-state={state}>
        <p className="text-muted-foreground text-sm">{t('recoveryIntro')}</p>
        <pre
          className="bg-muted overflow-x-auto rounded-lg p-4 font-mono text-sm"
          aria-label={t('recoveryListLabel')}
        >
          {recoveryCodes.join('\n')}
        </pre>
        <button type="button" onClick={onCopy} className="btn btn--secondary w-full justify-center">
          {t('copy')}
        </button>
        <div ref={feedbackRef} role="status" aria-live="polite" tabIndex={-1} className="text-sm">
          {messageKey ? t(messageKey as never) : null}
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.currentTarget.checked)}
          />
          <span>{t('acknowledge')}</span>
        </label>
        <button
          type="button"
          disabled={!acknowledged || state === 'complete'}
          onClick={onContinue}
          className="btn btn--accent w-full justify-center"
        >
          {state === 'complete' ? t('completing') : t('continue')}
        </button>
      </div>
    );

  if (!enroll) return null;
  return (
    <div className="space-y-4" data-auth-state={state}>
      <p className="text-muted-foreground text-sm">{t('scan')}</p>
      <div className="mx-auto w-fit rounded-xl bg-white p-3 shadow-sm">
        {/* Supabase returns the functional QR as an SVG data URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enroll.qrCode} alt={t('qrAlt')} className="h-44 w-44" />
      </div>
      <details className="text-muted-foreground text-sm">
        <summary className="cursor-pointer">{t('manual')}</summary>
        <code className="bg-muted mt-2 block rounded-md p-3 break-all select-all">
          {enroll.secret}
        </code>
      </details>
      <form onSubmit={onVerify} className="space-y-3" noValidate>
        <label className="block space-y-1" htmlFor="mfa-enroll-code">
          <span className="text-sm font-medium">{t('code')}</span>
          <Input
            id="mfa-enroll-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(sanitizeMfaCode(event.currentTarget.value))}
            required
            minLength={6}
            maxLength={8}
            aria-describedby={messageKey ? 'mfa-enroll-feedback' : undefined}
          />
        </label>
        {messageKey ? (
          <div
            id="mfa-enroll-feedback"
            ref={feedbackRef}
            role="alert"
            tabIndex={-1}
            className="text-destructive text-sm"
          >
            {t(messageKey as never)}
          </div>
        ) : null}
        <button
          type="submit"
          disabled={state === 'verifying' || state === 'cancelling'}
          className="btn btn--accent w-full justify-center"
        >
          {state === 'verifying' ? t('verifying') : t('verify')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={state === 'verifying' || state === 'cancelling'}
          className="btn btn--secondary w-full justify-center"
        >
          {state === 'cancelling' ? t('cancelling') : t('cancel')}
        </button>
      </form>
    </div>
  );
}
