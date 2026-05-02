'use client';
import { postJson } from '@/lib/http/post';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

type Enroll = { factorId: string; qrCode: string; uri: string; secret: string };

export function MfaEnrollCard() {
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      const res = await postJson('/api/v1/auth/mfa/enroll', {});
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? 'Could not start enrollment');
        return;
      }
      setEnroll(await res.json());
    })();
  }, []);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const code = new FormData(e.currentTarget).get('code');
    if (!enroll) return;
    start(async () => {
      const res = await postJson('/api/v1/auth/mfa/verify', { factorId: enroll.factorId, code, context: 'enroll' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? 'Verification failed');
        return;
      }
      const data = await res.json();
      setRecoveryCodes(data.recoveryCodes as string[]);
    });
  }

  if (recoveryCodes) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">
          Save these recovery codes somewhere safe. Each works once.
        </p>
        <pre className="rounded bg-zinc-100 p-3 font-mono text-sm">{recoveryCodes.join('\n')}</pre>
        <Link href="/" className="block text-center text-sm underline">
          I&apos;ve saved them — continue
        </Link>
      </div>
    );
  }

  if (!enroll) return <p className="text-sm text-zinc-600">Loading…</p>;

  return (
    <div className="space-y-4">
      {/* Supabase returns the QR as an SVG data URL */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enroll.qrCode} alt="TOTP QR" className="mx-auto h-44 w-44" />
      <details className="text-xs text-zinc-500">
        <summary>Can&apos;t scan? Enter secret manually</summary>
        <code className="mt-1 block break-all">{enroll.secret}</code>
      </details>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">6-digit code</span>
          <input
            name="code"
            inputMode="numeric"
            required
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-black py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Verifying…' : 'Enable two-factor'}
        </button>
      </form>
    </div>
  );
}
