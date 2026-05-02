'use client';
import { postJson } from '@/lib/http/post';
import { useState, useTransition } from 'react';

export function ForgotPasswordForm() {
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
    return (
      <p className="text-sm text-zinc-600">
        If an account exists for that email, we sent a reset link. Check your inbox.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Email</span>
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
        {pending ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  );
}
