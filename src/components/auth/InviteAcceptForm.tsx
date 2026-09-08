'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { PasswordInput } from '@/components/auth/PasswordInput';
import { Input } from '@/components/ui/input';
import { postJson } from '@/lib/http/post';
import { claimAuthSubmission, releaseAuthSubmission } from './auth-form-state';
import { inviteFailureCategory, validateNewPassword } from './auth-recovery-state';

const POLICY_VERSION = 'v1';

type Props = { token: string; tokenState: 'ready' | 'invalid' };

export function InviteAcceptForm({ token, tokenState }: Props) {
  const t = useTranslations('auth.recovery.invite');
  const router = useRouter();
  const latch = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<'ready' | 'validation' | 'pending' | 'failure' | 'success'>(
    tokenState === 'ready' ? 'ready' : 'failure',
  );
  const [message, setMessage] = useState<string | null>(null);

  if (tokenState !== 'ready') {
    return (
      <div className="space-y-4" data-auth-state="invalid">
        <p role="alert" className="text-destructive text-sm">
          {t('states.invalid')}
        </p>
        <Link href="/login" className="btn btn--accent w-full justify-center">
          {t('signIn')}
        </Link>
      </div>
    );
  }

  function showFailure(nextState: 'validation' | 'failure', nextMessage: string) {
    setState(nextState);
    setMessage(nextMessage);
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!claimAuthSubmission(latch)) return;
    const values = new FormData(event.currentTarget);
    const fullName = String(values.get('fullName') ?? '').trim();
    const phone = String(values.get('phone') ?? '').trim();
    const password = String(values.get('password') ?? '');
    const consentAccepted = values.get('consent') === 'on';
    if (
      !fullName ||
      fullName.length > 200 ||
      (phone !== '' && !/^\+[1-9]\d{7,14}$/u.test(phone)) ||
      validateNewPassword(password).length > 0 ||
      !consentAccepted
    ) {
      releaseAuthSubmission(latch);
      showFailure('validation', t('states.validation'));
      return;
    }

    setMessage(null);
    setPending(true);
    setState('pending');
    try {
      const payload = {
        token,
        fullName,
        password,
        phone: phone || undefined,
        consentAccepted,
        policyVersion: POLICY_VERSION,
      };
      const response = await postJson('/api/v1/auth/invite/accept', payload);
      const data = (await response.json().catch(() => null)) as { code?: string } | null;
      if (!response.ok) {
        const category = inviteFailureCategory(data?.code);
        const key =
          category === 'invalid'
            ? 'states.invalid'
            : category === 'expired'
              ? 'states.expired'
              : category === 'rateLimited'
                ? 'states.rateLimited'
                : category === 'sessionRefreshRequired'
                  ? 'states.sessionRefreshRequired'
                  : category === 'validation'
                    ? 'states.validation'
                    : 'states.failure';
        showFailure(category === 'validation' ? 'validation' : 'failure', t(key));
        releaseAuthSubmission(latch);
        setPending(false);
        return;
      }
      setState('success');
      setMessage(t('states.success'));
      router.replace('/');
    } catch {
      showFailure('failure', t('states.failure'));
      releaseAuthSubmission(latch);
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate data-auth-state={state}>
      {message ? (
        <div
          ref={feedbackRef}
          role={state === 'success' ? 'status' : 'alert'}
          aria-live={state === 'success' ? 'polite' : 'assertive'}
          tabIndex={-1}
          className={state === 'success' ? 'text-sm' : 'text-destructive text-sm'}
        >
          {message}
        </div>
      ) : null}
      <label className="block space-y-1" htmlFor="invite-full-name">
        <span className="text-sm font-medium">{t('fullName')}</span>
        <Input id="invite-full-name" name="fullName" autoComplete="name" required maxLength={200} />
      </label>
      <label className="block space-y-1" htmlFor="invite-phone">
        <span className="text-sm font-medium">{t('phoneOptional')}</span>
        <Input id="invite-phone" name="phone" type="tel" autoComplete="tel" />
      </label>
      <label className="block space-y-1" htmlFor="invite-password">
        <span className="text-sm font-medium">{t('password')}</span>
        <PasswordInput
          id="invite-password"
          name="password"
          required
          maxLength={200}
          autoComplete="new-password"
          aria-describedby="invite-password-policy"
        />
      </label>
      <p id="invite-password-policy" className="text-muted-foreground text-xs">
        {t('passwordPolicy')}
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" required className="mt-1 size-4" />
        <span>{t('consent')}</span>
      </label>
      <button
        type="submit"
        disabled={pending || state === 'success'}
        aria-busy={pending}
        className="btn btn--accent w-full justify-center"
      >
        {pending ? t('pending') : t('submit')}
      </button>
    </form>
  );
}
