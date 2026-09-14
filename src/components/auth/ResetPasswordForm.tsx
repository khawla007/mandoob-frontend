'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { PasswordInput } from '@/components/auth/PasswordInput';
import { postJson } from '@/lib/http/post';
import { claimAuthSubmission, releaseAuthSubmission } from './auth-form-state';
import { resetPasswordFailureCategory, validateNewPassword } from './auth-recovery-state';

type Props = { recoveryState: 'ready' | 'invalid' };

export function ResetPasswordForm({ recoveryState }: Props) {
  const t = useTranslations('auth.recovery.reset');
  const latch = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<
    'ready' | 'validation' | 'pending' | 'failure' | 'terminal' | 'success'
  >(recoveryState === 'ready' ? 'ready' : 'failure');
  const [message, setMessage] = useState<string | null>(null);

  if (recoveryState !== 'ready') {
    return (
      <div className="space-y-4" data-auth-state="invalid">
        <p role="alert" className="text-destructive text-sm">
          {t('states.invalid')}
        </p>
        <Link href="/forgot-password" className="btn btn--accent w-full justify-center">
          {t('requestAnother')}
        </Link>
      </div>
    );
  }

  function showFailure(nextMessage: string, validation = false) {
    setState(validation ? 'validation' : 'failure');
    setMessage(nextMessage);
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!claimAuthSubmission(latch)) return;
    const values = new FormData(event.currentTarget);
    const password = String(values.get('password') ?? '');
    const confirmPassword = String(values.get('confirmPassword') ?? '');
    if (validateNewPassword(password).length > 0) {
      releaseAuthSubmission(latch);
      showFailure(t('validation.passwordPolicy'), true);
      return;
    }
    if (!confirmPassword || password !== confirmPassword) {
      releaseAuthSubmission(latch);
      showFailure(t('validation.passwordMismatch'), true);
      return;
    }

    setState('pending');
    setMessage(null);
    try {
      const response = await postJson('/api/v1/auth/reset-password', { password });
      const data = (await response.json().catch(() => null)) as { code?: string } | null;
      if (!response.ok) {
        const category = resetPasswordFailureCategory(data?.code);
        if (category === 'invalidOrExpired') {
          setState('terminal');
          setMessage(t('states.invalid'));
          releaseAuthSubmission(latch);
          return;
        }
        showFailure(
          category === 'rateLimited'
            ? t('states.rateLimited')
            : category === 'sessionRefreshRequired'
              ? t('states.sessionRefreshRequired')
              : category === 'validation'
                ? t('validation.passwordPolicy')
                : t('states.failure'),
          category === 'validation',
        );
        releaseAuthSubmission(latch);
        return;
      }
      setState('success');
      setMessage(t('states.success'));
    } catch {
      showFailure(t('states.failure'));
      releaseAuthSubmission(latch);
    }
  }

  if (state === 'success') {
    return (
      <div className="space-y-4" data-auth-state="success">
        <p role="status" className="text-sm">
          {message}
        </p>
        <Link href="/login" className="btn btn--accent w-full justify-center">
          {t('signIn')}
        </Link>
      </div>
    );
  }

  if (state === 'terminal') {
    return (
      <div className="space-y-4" data-auth-state="terminal">
        <p role="alert" className="text-destructive text-sm">
          {message ?? t('states.invalid')}
        </p>
        <Link href="/forgot-password" className="btn btn--accent w-full justify-center">
          {t('requestAnother')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate data-auth-state={state}>
      {message ? (
        <div
          ref={feedbackRef}
          id="reset-feedback"
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="text-destructive text-sm"
        >
          {message}
        </div>
      ) : null}
      <label className="block space-y-1" htmlFor="reset-password">
        <span className="text-sm font-medium">{t('newPassword')}</span>
        <PasswordInput
          id="reset-password"
          name="password"
          required
          maxLength={200}
          autoComplete="new-password"
          aria-describedby="reset-password-policy"
        />
      </label>
      <p id="reset-password-policy" className="text-muted-foreground text-xs">
        {t('passwordPolicy')}
      </p>
      <label className="block space-y-1" htmlFor="reset-confirm-password">
        <span className="text-sm font-medium">{t('confirmPassword')}</span>
        <PasswordInput
          id="reset-confirm-password"
          name="confirmPassword"
          required
          maxLength={200}
          autoComplete="new-password"
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
    </form>
  );
}
