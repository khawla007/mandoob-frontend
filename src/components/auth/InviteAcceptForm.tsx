'use client';
import { postJson } from '@/lib/http/post';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { PasswordInput } from '@/components/auth/PasswordInput';

const POLICY_VERSION = 'v1';

export function InviteAcceptForm({ token }: { token: string }) {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const payload = {
      token,
      fullName: f.get('fullName'),
      password: f.get('password'),
      phone: f.get('phone') || undefined,
      consentAccepted: f.get('consent') === 'on',
      policyVersion: POLICY_VERSION,
    };
    start(async () => {
      const res = await postJson('/api/v1/auth/invite/accept', payload);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? tErrors('acceptFailed'));
        return;
      }
      window.location.href = '/';
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <F label={t('fullName')} name="fullName" required />
      <F label={t('phoneOptional')} name="phone" type="tel" placeholder="+971501234567" />
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('password')}</span>
        <PasswordInput
          name="password"
          required
          autoComplete="new-password"
          className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none"
        />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" required className="mt-1 h-4 w-4" />
        <span>{t('agreePdpl')}</span>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-black py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? t('settingUp') : t('acceptAndContinue')}
      </button>
    </form>
  );
}

function F({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        {...props}
        className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none"
      />
    </label>
  );
}
