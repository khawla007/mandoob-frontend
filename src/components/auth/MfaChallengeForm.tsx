'use client';
import { postJson } from '@/lib/http/post';
import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

export function MfaChallengeForm() {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp?.[0];
      if (totp) setFactorId(totp.id);
    })();
  }, []);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!factorId) return;
    const code = new FormData(e.currentTarget).get('code');
    start(async () => {
      const res = await postJson('/api/v1/auth/mfa/verify', {
        factorId,
        code,
        context: 'challenge',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? tErrors('verificationFailed'));
        return;
      }
      const next = new URLSearchParams(window.location.search).get('next') ?? '/';
      window.location.href = next;
    });
  }

  if (!factorId) return <p className="text-sm text-zinc-600">{t('noFactorFound')}</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('twoFactorCode')}</span>
        <input
          name="code"
          inputMode="numeric"
          required
          autoFocus
          className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-black py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? t('verifying') : t('continue')}
      </button>
    </form>
  );
}
