'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { postJson } from '@/lib/http/post';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const RESEND_COOLDOWN_SEC = 60;
const CODE_LEN = 6;

export function OtpForm({ email }: { email: string }) {
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LEN).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [pending, start] = useTransition();
  const [resendPending, startResend] = useTransition();
  const [cooldown, setCooldown] = useState(0);
  const refs = useRef<Array<HTMLInputElement | null>>(Array(CODE_LEN).fill(null));
  const submittingRef = useRef(false);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const code = digits.join('');
  const complete = code.length === CODE_LEN && digits.every((d) => /\d/.test(d));

  function submitCode(full: string) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    start(async () => {
      const res = await postJson('/api/v1/auth/verify-otp', { email, token: full });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        redirectTo?: string;
      } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? 'Verification failed');
        setDigits(Array(CODE_LEN).fill(''));
        refs.current[0]?.focus();
        submittingRef.current = false;
        return;
      }
      setSucceeded(true);
      window.location.href = data.redirectTo ?? '/';
    });
  }

  function setAt(idx: number, val: string) {
    const clean = val.replace(/\D/g, '');
    if (!clean) {
      setDigits((prev) => {
        const next = [...prev];
        next[idx] = '';
        return next;
      });
      return;
    }
    const next = [...digits];
    let cursor = idx;
    for (const ch of clean) {
      if (cursor >= CODE_LEN) break;
      next[cursor] = ch;
      cursor += 1;
    }
    setDigits(next);
    const focusAt = Math.min(cursor, CODE_LEN - 1);
    refs.current[focusAt]?.focus();
    const full = next.join('');
    if (full.length === CODE_LEN && /^\d{6}$/.test(full)) {
      submitCode(full);
    }
  }

  function onKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      e.preventDefault();
      refs.current[idx - 1]?.focus();
      setDigits((prev) => {
        const next = [...prev];
        next[idx - 1] = '';
        return next;
      });
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      refs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < CODE_LEN - 1) {
      e.preventDefault();
      refs.current[idx + 1]?.focus();
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!complete) return;
    submitCode(code);
  }

  function onResend() {
    if (cooldown > 0) return;
    startResend(async () => {
      const res = await postJson('/api/v1/auth/resend-otp', { email });
      if (!res.ok) {
        toast.error('Could not resend. Try again shortly.');
        return;
      }
      toast.success('New code sent.');
      setDigits(Array(CODE_LEN).fill(''));
      setError(null);
      submittingRef.current = false;
      refs.current[0]?.focus();
      setCooldown(RESEND_COOLDOWN_SEC);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <div className="flex justify-center gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label={`Digit ${i + 1}`}
              maxLength={1}
              value={d}
              onChange={(e) => setAt(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              onFocus={(e) => e.currentTarget.select()}
              className={cn(
                'border-input bg-background focus-visible:ring-ring size-12 rounded-md border text-center font-mono text-xl font-semibold tabular-nums focus-visible:ring-2 focus-visible:outline-none',
                error && 'border-destructive',
              )}
            />
          ))}
        </div>
        <p className="text-muted-foreground text-center text-xs">
          Check your inbox (and spam). The code expires in 10 minutes.
        </p>
      </div>
      {error && <p className="text-destructive text-center text-sm">{error}</p>}
      <Button
        type="submit"
        className="w-full"
        disabled={pending || succeeded || !complete}
        aria-live="polite"
      >
        {succeeded ? (
          <>
            <Check className="size-4" />
            Verified
          </>
        ) : pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Verifying…
          </>
        ) : (
          'Verify'
        )}
      </Button>
      <button
        type="button"
        onClick={onResend}
        disabled={cooldown > 0 || resendPending || succeeded}
        className="text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground w-full text-center text-xs underline-offset-4 hover:underline disabled:cursor-not-allowed"
      >
        {cooldown > 0 ? `Resend code in ${cooldown}s` : resendPending ? 'Sending…' : 'Resend code'}
      </button>
    </form>
  );
}
