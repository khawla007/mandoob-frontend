'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import { postJson } from '@/lib/http/post';
import { claimAuthSubmission, releaseAuthSubmission } from './auth-form-state';
import { forgotPasswordFailureCategory, isAcceptedEmailContext } from './auth-recovery-state';

export function ForgotPasswordForm() {
  const t = useTranslations('auth.recovery.forgot');
  const latch = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'validation' | 'pending' | 'complete' | 'failure'>(
    'idle',
  );
  const [message, setMessage] = useState<string | null>(null);

  function showFailure(nextMessage: string, nextState: 'validation' | 'failure' = 'failure') {
    setState(nextState);
    setMessage(nextMessage);
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!claimAuthSubmission(latch)) return;
    const normalizedEmail = email.trim();
    if (!isAcceptedEmailContext(normalizedEmail)) {
      releaseAuthSubmission(latch);
      setState('validation');
      setMessage(t('validation.invalidEmail'));
      requestAnimationFrame(() => feedbackRef.current?.focus());
      return;
    }
    setState('pending');
    setMessage(null);
    try {
      const response = await postJson('/api/v1/auth/forgot-password', { email: normalizedEmail });
      const data = (await response.json().catch(() => null)) as { code?: string } | null;
      if (!response.ok) {
        const category = forgotPasswordFailureCategory(data?.code);
        if (category === 'validation') {
          showFailure(t('validation.invalidEmail'), 'validation');
        } else {
          showFailure(
            category === 'rateLimited'
              ? t('rateLimited')
              : category === 'sessionRefreshRequired'
                ? t('sessionRefreshRequired')
                : t('transport'),
          );
        }
        releaseAuthSubmission(latch);
        return;
      }
      setState('complete');
      setMessage(t('completion'));
    } catch {
      showFailure(t('transport'));
      releaseAuthSubmission(latch);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate data-auth-state={state}>
      {message ? (
        <div
          id="forgot-feedback"
          ref={feedbackRef}
          role={state === 'complete' ? 'status' : 'alert'}
          aria-live={state === 'complete' ? 'polite' : 'assertive'}
          tabIndex={-1}
          className={state === 'complete' ? 'text-sm' : 'text-destructive text-sm'}
        >
          {message}
        </div>
      ) : null}
      {state !== 'complete' ? (
        <>
          <label className="block space-y-1" htmlFor="forgot-email">
            <span className="text-sm font-medium">{t('email')}</span>
            <Input
              id="forgot-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              aria-invalid={state === 'validation'}
              aria-describedby={state === 'validation' ? 'forgot-feedback' : undefined}
            />
          </label>
          <button
            type="submit"
            disabled={state === 'pending'}
            aria-busy={state === 'pending'}
            className="btn btn--accent w-full justify-center"
          >
            {state === 'pending' ? t('pending') : t('submit')}
          </button>
        </>
      ) : null}
    </form>
  );
}
