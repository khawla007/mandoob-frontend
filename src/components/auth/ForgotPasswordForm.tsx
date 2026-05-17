'use client';
import { postJson } from '@/lib/http/post';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get('email');
    start(async () => {
      await postJson('/api/v1/auth/forgot-password', { email });
      setSent(true);
    });
  }

  if (sent) {
    return <p className="text-sm text-zinc-600">{t('longCopy.ifAccountExists')}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('email')}</span>
        <input
          name="email"
          type="email"
          required
          className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-black py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? t('sending') : t('sendResetLink')}
      </button>
    </form>
  );
}
