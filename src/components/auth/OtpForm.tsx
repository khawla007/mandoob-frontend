'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { postJson } from '@/lib/http/post';
import { startRouteProgress } from '@/components/navigation/RouteProgress';
import { cn } from '@/lib/utils';

const RESEND_COOLDOWN_SEC = 60;
const CODE_LEN = 6;

export function OtpForm({ email }: { email: string }) {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const router = useRouter();
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
        setError(data?.error ?? tErrors('verificationFailed'));
        setDigits(Array(CODE_LEN).fill(''));
        refs.current[0]?.focus();
        submittingRef.current = false;
        return;
      }
      setSucceeded(true);
      startRouteProgress();
      router.replace(data.redirectTo ?? '/');
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
        toast.error(tErrors('couldNotResend'));
        return;
      }
      toast.success(tErrors('newCodeSent'));
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
        <p className="text-muted-foreground text-center text-xs">{t('longCopy.checkInbox')}</p>
      </div>
      {error && <p className="text-destructive text-center text-sm">{error}</p>}
      <button
        type="submit"
        className="btn btn--accent w-full justify-center"
        disabled={pending || succeeded || !complete}
        aria-busy={pending}
        aria-live="polite"
      >
        {succeeded ? (
          <>
            <Check className="size-4" />
            {t('verified')}
          </>
        ) : pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t('verifying')}
          </>
        ) : (
          t('verify')
        )}
      </button>
      <button
        type="button"
        onClick={onResend}
        disabled={cooldown > 0 || resendPending || succeeded}
        className="text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground w-full text-center text-xs underline-offset-4 hover:underline disabled:cursor-not-allowed"
      >
        {cooldown > 0
          ? t('resendIn', { seconds: cooldown })
          : resendPending
            ? t('resending')
            : t('resendCode')}
      </button>
    </form>
  );
}
