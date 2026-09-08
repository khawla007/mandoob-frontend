'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { postJson } from '@/lib/http/post';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import {
  mfaFactorDiscoveryCategory,
  mfaFailureCategory,
  mfaSuccessDestination,
  sanitizeMfaCode,
} from './mfa-state';

type State = 'loading' | 'noFactor' | 'ready' | 'pending' | 'failure' | 'repair' | 'complete';

export function MfaChallengeForm() {
  const router = useRouter();
  const t = useTranslations('auth.mfa.challenge');
  const inFlight = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [state, setState] = useState<State>('loading');
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [code, setCode] = useState('');
  const [messageKey, setMessageKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getSupabaseBrowserClient()
      .auth.mfa.listFactors()
      .then(
        (result: {
          data?: { totp?: Array<{ id: string; status: string }> } | null;
          error?: unknown;
        }) => {
          const { data, error } = result;
          if (!active) return;
          if (error) {
            setState('failure');
            setMessageKey(`states.${mfaFactorDiscoveryCategory(error)}`);
            return;
          }
          const factor = data?.totp?.find((item: { status: string }) => item.status === 'verified');
          if (!factor) {
            setState('noFactor');
            return;
          }
          setFactorId(factor.id);
          setState('ready');
        },
      )
      .catch(() => {
        if (active) {
          setState('failure');
          setMessageKey('states.failure');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function showFailure(key: string) {
    setState('failure');
    setMessageKey(key);
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || (mode === 'totp' && !factorId)) return;
    if (mode === 'totp' && code.length < 6) return showFailure('states.invalidOrExpired');
    if (mode === 'recovery' && code.trim().length < 6) return showFailure('states.invalidRecovery');
    inFlight.current = true;
    setState('pending');
    setMessageKey(null);
    try {
      const response =
        mode === 'recovery'
          ? await postJson('/api/v1/auth/mfa/recovery', { code })
          : await postJson('/api/v1/auth/mfa/verify', { factorId, code, context: 'challenge' });
      const data = (await response.json().catch(() => null)) as { code?: string } | null;
      if (!response.ok) {
        const category = mfaFailureCategory(data?.code);
        if (category === 'repairRequired') {
          setState('repair');
          setMessageKey('states.repairRequired');
          return;
        }
        return showFailure(
          mode === 'recovery' && category === 'invalidOrExpired'
            ? 'states.invalidRecovery'
            : `states.${category}`,
        );
      }
      setCode('');
      setState('complete');
      const rawNext = new URLSearchParams(window.location.search).get('next');
      router.replace(mfaSuccessDestination(mode, rawNext));
    } catch {
      showFailure('states.failure');
    } finally {
      inFlight.current = false;
    }
  }

  if (state === 'loading')
    return (
      <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
        {t('loading')}
      </p>
    );
  if (state === 'repair')
    return (
      <div className="space-y-4" data-auth-state={state}>
        <div role="alert" className="text-destructive text-sm">
          {t('states.repairRequired')}
        </div>
        <Link href="/login" className="btn btn--accent w-full justify-center">
          {t('signIn')}
        </Link>
        <Link href="/contact" className="btn btn--secondary w-full justify-center">
          {t('contactSupport')}
        </Link>
      </div>
    );
  if (state === 'failure' && !factorId && mode === 'totp')
    return (
      <div className="space-y-4" data-auth-state={state}>
        <div role="alert" className="text-destructive text-sm">
          {messageKey ? t(messageKey as never) : t('states.failure')}
        </div>
        {messageKey === 'states.sessionExpired' ? (
          <Link href="/login" className="btn btn--accent w-full justify-center">
            {t('signIn')}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn btn--secondary w-full justify-center"
          >
            {t('retryDiscovery')}
          </button>
        )}
      </div>
    );
  if (state === 'noFactor')
    return (
      <div className="space-y-4">
        <div role="alert" className="text-destructive text-sm">
          {t('noFactor')}
        </div>
        <button
          type="button"
          onClick={() => {
            setMode('recovery');
            setState('ready');
          }}
          className="btn btn--secondary w-full justify-center"
        >
          {t('useRecovery')}
        </button>
      </div>
    );

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate data-auth-state={state}>
      <p className="text-muted-foreground text-sm">
        {mode === 'totp' ? t('instructions') : t('recoveryInstructions')}
      </p>
      <label className="block space-y-1" htmlFor="mfa-challenge-code">
        <span className="text-sm font-medium">
          {mode === 'totp' ? t('code') : t('recoveryCode')}
        </span>
        <Input
          id="mfa-challenge-code"
          name="code"
          type={mode === 'recovery' ? 'password' : 'text'}
          inputMode={mode === 'totp' ? 'numeric' : 'text'}
          autoComplete="one-time-code"
          value={code}
          onChange={(event) =>
            setCode(
              mode === 'totp'
                ? sanitizeMfaCode(event.currentTarget.value)
                : event.currentTarget.value.slice(0, 20),
            )
          }
          required
          maxLength={mode === 'totp' ? 8 : 20}
          aria-describedby={messageKey ? 'mfa-challenge-feedback' : undefined}
        />
      </label>
      {messageKey ? (
        <div
          id="mfa-challenge-feedback"
          ref={feedbackRef}
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="text-destructive text-sm"
        >
          {t(messageKey as never)}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={state === 'pending' || state === 'complete'}
        aria-busy={state === 'pending'}
        className="btn btn--accent w-full justify-center"
      >
        {state === 'pending'
          ? t('pending')
          : state === 'complete'
            ? t('completing')
            : t('continue')}
      </button>
      <button
        type="button"
        disabled={state === 'pending' || state === 'complete'}
        onClick={() => {
          const nextMode = mode === 'totp' ? 'recovery' : 'totp';
          setMode(nextMode);
          setCode('');
          setMessageKey(null);
          setState(nextMode === 'totp' && !factorId ? 'noFactor' : 'ready');
        }}
        className="btn btn--secondary w-full justify-center"
      >
        {mode === 'totp' ? t('useRecovery') : t('useAuthenticator')}
      </button>
    </form>
  );
}
