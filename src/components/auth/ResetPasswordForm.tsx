'use client';
import { postJson } from '@/lib/http/post';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PasswordInput } from '@/components/auth/PasswordInput';

export function ResetPasswordForm() {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const tCommon = useTranslations('common');
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const token = params.get('token') ?? '';

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const password = new FormData(e.currentTarget).get('password');
    start(async () => {
      const res = await postJson('/api/v1/auth/reset-password', { token, password });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? tErrors('resetFailed'));
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <p className="text-sm text-zinc-600">
        {t('passwordUpdated')}{' '}
        <Link href="/login" className="underline">
          {t('signIn')}
        </Link>
        .
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('newPassword')}</span>
        <PasswordInput
          name="password"
          required
          autoComplete="new-password"
          className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-black py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? tCommon('saving') : t('setNewPassword')}
      </button>
    </form>
  );
}
