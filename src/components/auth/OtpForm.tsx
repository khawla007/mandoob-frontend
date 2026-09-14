'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { startRouteProgress } from '@/components/navigation/RouteProgress';
import { postJson } from '@/lib/http/post';
import { sharedSafeDestination } from '@/lib/auth/safe-redirect';
import { cn } from '@/lib/utils';
import { claimAuthSubmission, releaseAuthSubmission } from './auth-form-state';
import { otpFailureCategory, sanitizeOtpDigits } from './auth-recovery-state';

const CODE_LEN = 6;
const RESEND_COOLDOWN_SECONDS = 60;

type Props = { email?: string; contextState?: 'ready' | 'missing' };

export function OtpForm({ email, contextState = 'ready' }: Props) {
  const t = useTranslations('auth.recovery.otp');
  const router = useRouter();
  const operationLatch = useRef(false);
  const refs = useRef<Array<HTMLInputElement | null>>(Array(CODE_LEN).fill(null));
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LEN).fill(''));
  const [state, setState] = useState<
    'idle' | 'incomplete' | 'verifying' | 'failure' | 'resendPending' | 'resendSuccess' | 'success'
  >('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (contextState === 'ready') refs.current[0]?.focus();
  }, [contextState]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  if (contextState !== 'ready' || !email) {
    return (
      <div className="space-y-4" data-auth-state="missing-context">
        <p role="alert" className="text-destructive text-sm">
          {t('missingContext')}
        </p>
        <Link href="/register" className="btn btn--accent w-full justify-center">
          {t('returnToRegistration')}
        </Link>
      </div>
    );
  }

  const code = digits.join('');

  function updateDigits(start: number, raw: string) {
    const clean = sanitizeOtpDigits(raw);
    const next = [...digits];
    if (!clean) {
      next[start] = '';
      setDigits(next);
      setMessage(null);
      setState('idle');
      return;
    }
    for (let offset = 0; offset < clean.length && start + offset < CODE_LEN; offset += 1) {
      next[start + offset] = clean[offset]!;
    }
    setDigits(next);
    setMessage(null);
    setState('idle');
    refs.current[Math.min(start + Math.max(clean.length, 1), CODE_LEN - 1)]?.focus();
  }

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const pasted = sanitizeOtpDigits(event.clipboardData.getData('text'));
    if (!pasted) return;
    const next = Array(CODE_LEN).fill('');
    for (let index = 0; index < pasted.length; index += 1) next[index] = pasted[index]!;
    setDigits(next);
    setMessage(null);
    setState('idle');
    refs.current[Math.min(pasted.length, CODE_LEN) - 1]?.focus();
  }

  function onKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault();
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      refs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      refs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < CODE_LEN - 1) {
      event.preventDefault();
      refs.current[index + 1]?.focus();
    }
  }

  async function submitCode() {
    if (!/^\d{6}$/u.test(code)) {
      setState('incomplete');
      setMessage(t('states.incomplete'));
      return;
    }
    if (!claimAuthSubmission(operationLatch)) return;
    setState('verifying');
    setMessage(t('states.verifying'));
    try {
      const response = await postJson('/api/v1/auth/verify-otp', { email, token: code });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        code?: string;
        redirectTo?: string;
      } | null;
      if (!response.ok || !data?.ok) {
        const category = otpFailureCategory(data?.code);
        setState(category === 'incomplete' ? 'incomplete' : 'failure');
        setMessage(
          category === 'invalidOrExpired'
            ? t('states.invalidOrExpired')
            : category === 'rateLimited'
              ? t('states.rateLimited')
              : category === 'locked'
                ? t('states.locked')
                : category === 'sessionRefreshRequired'
                  ? t('states.sessionRefreshRequired')
                  : category === 'incomplete'
                    ? t('states.incomplete')
                    : t('states.failure'),
        );
        setDigits(Array(CODE_LEN).fill(''));
        refs.current[0]?.focus();
        releaseAuthSubmission(operationLatch);
        return;
      }
      setState('success');
      setMessage(t('states.success'));
      startRouteProgress();
      router.replace(sharedSafeDestination(data.redirectTo));
    } catch {
      setState('failure');
      setMessage(t('states.failure'));
      releaseAuthSubmission(operationLatch);
    }
  }

  async function resendCode() {
    if (cooldown > 0 || !claimAuthSubmission(operationLatch)) return;
    setState('resendPending');
    setMessage(t('states.resendPending'));
    try {
      const response = await postJson('/api/v1/auth/resend-otp', { email });
      const data = (await response.json().catch(() => null)) as { code?: string } | null;
      if (!response.ok) {
        const category = otpFailureCategory(data?.code);
        setState('failure');
        setMessage(
          category === 'rateLimited' ? t('states.rateLimited') : t('states.resendFailure'),
        );
        releaseAuthSubmission(operationLatch);
        return;
      }
      setDigits(Array(CODE_LEN).fill(''));
      releaseAuthSubmission(operationLatch);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setState('resendSuccess');
      setMessage(t('states.resendSuccess'));
      refs.current[0]?.focus();
    } catch {
      setState('failure');
      setMessage(t('states.resendFailure'));
      releaseAuthSubmission(operationLatch);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submitCode();
      }}
      className="space-y-4"
      noValidate
      data-auth-state={state}
    >
      <div
        role="group"
        aria-label={t('codeGroupLabel')}
        aria-describedby="otp-help otp-status"
        onPaste={onPaste}
        className="flex justify-center gap-2"
      >
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => {
              refs.current[index] = element;
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            aria-label={t('digitLabel', { number: index + 1 })}
            aria-invalid={state === 'failure' || state === 'incomplete'}
            maxLength={1}
            value={digit}
            onChange={(event) => updateDigits(index, event.currentTarget.value)}
            onKeyDown={(event) => onKeyDown(index, event)}
            onFocus={(event) => event.currentTarget.select()}
            className={cn(
              'border-input bg-background focus-visible:ring-ring size-12 rounded-md border text-center font-mono text-xl font-semibold tabular-nums focus-visible:ring-2 focus-visible:outline-none',
              (state === 'failure' || state === 'incomplete') && 'border-destructive',
            )}
          />
        ))}
      </div>
      <p id="otp-help" className="text-muted-foreground text-center text-xs">
        {t('help')}
      </p>
      <p
        id="otp-status"
        role={state === 'failure' || state === 'incomplete' ? 'alert' : 'status'}
        aria-live="polite"
        className={cn(
          'min-h-5 text-center text-sm',
          (state === 'failure' || state === 'incomplete') && 'text-destructive',
        )}
      >
        {message}
      </p>
      <button
        type="submit"
        disabled={state === 'verifying' || state === 'resendPending' || state === 'success'}
        aria-busy={state === 'verifying'}
        className="btn btn--accent w-full justify-center"
      >
        {state === 'verifying' ? t('verifying') : state === 'success' ? t('verified') : t('verify')}
      </button>
      <button
        type="button"
        onClick={() => void resendCode()}
        disabled={
          cooldown > 0 || state === 'verifying' || state === 'resendPending' || state === 'success'
        }
        className="text-muted-foreground hover:text-foreground w-full text-center text-xs underline-offset-4 hover:underline disabled:cursor-not-allowed"
      >
        {cooldown > 0
          ? t('resendCooldown', { seconds: cooldown })
          : state === 'resendPending'
            ? t('resending')
            : t('resend')}
      </button>
    </form>
  );
}
