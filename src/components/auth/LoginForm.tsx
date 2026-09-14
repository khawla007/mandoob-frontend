'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { postJson } from '@/lib/http/post';
import { startRouteProgress } from '@/components/navigation/RouteProgress';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { Checkbox } from '@/components/ui/checkbox';
import {
  claimAuthSubmission,
  loginFailureCategory,
  loginSuccessDestination,
  releaseAuthSubmission,
  createLoginFormSchema,
} from '@/components/auth/auth-form-state';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

type FormInput = { email: string; password: string; rememberMe: boolean };

export function LoginForm() {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const submissionLatch = useRef(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'status'; message: string } | null>(
    null,
  );
  const [isNavigating, startTransition] = useTransition();
  const busy = pending || isNavigating;
  const schema = useMemo(
    () =>
      createLoginFormSchema({
        fullNameRequired: t('validation.fullNameRequired'),
        invalidEmail: t('validation.invalidEmail'),
        invalidPhone: t('validation.invalidPhone'),
        passwordRequired: t('validation.passwordRequired'),
        passwordLength: t('validation.passwordLength'),
        passwordUppercase: t('validation.passwordUppercase'),
        passwordLowercase: t('validation.passwordLowercase'),
        passwordSpecial: t('validation.passwordSpecial'),
        confirmPasswordRequired: t('validation.confirmPasswordRequired'),
        passwordMismatch: t('validation.passwordMismatch'),
        consentRequired: t('validation.consentRequired'),
      }),
    [t],
  );
  const form = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  useEffect(() => {
    if (feedback?.tone === 'error') errorSummaryRef.current?.focus();
  }, [feedback]);

  function safeLoginError(code: string | undefined): string {
    switch (loginFailureCategory(code)) {
      case 'validation':
        return tErrors('fixHighlighted');
      case 'invalidCredentials':
        return t('invalidCredentials');
      case 'rateLimited':
        return tErrors('longCopy.rateLimited');
      case 'authorizationUnavailable':
        return t('authorizationUnavailable');
      case 'sessionRefreshRequired':
        return t('sessionRefreshRequired');
      default:
        return tErrors('signInFailed');
    }
  }

  function showError(message: string) {
    setFeedback({ tone: 'error', message });
  }

  async function onSubmit(values: FormInput) {
    if (!claimAuthSubmission(submissionLatch)) return;
    setFeedback(null);
    setPending(true);
    try {
      const res = await postJson('/api/v1/auth/login', values);
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        code?: string;
        redirectTo?: string;
        details?: { email?: string };
      } | null;
      if (!res.ok || !data?.ok) {
        if (data?.code === 'EMAIL_NOT_VERIFIED' && data.details?.email) {
          const unverifiedEmail = data.details.email;
          setFeedback({ tone: 'status', message: t('verifyEmailToContinue') });
          startRouteProgress();
          startTransition(() => {
            router.replace(`/verify-otp?email=${encodeURIComponent(unverifiedEmail)}`);
          });
          return;
        }
        showError(safeLoginError(data?.code));
        releaseAuthSubmission(submissionLatch);
        setPending(false);
        return;
      }
      startRouteProgress();
      startTransition(() => {
        router.replace(loginSuccessDestination(data.redirectTo));
      });
    } catch {
      showError(tErrors('networkError'));
      releaseAuthSubmission(submissionLatch);
      setPending(false);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    void form.handleSubmit(onSubmit, () => showError(tErrors('fixHighlighted')))(event);
  }

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div role="group" aria-label={t('signInMethod')} className="grid grid-cols-2 gap-2">
          <span className="btn btn--sm btn--accent">{t('emailMethod')}</span>
          <span className="btn btn--sm opacity-60">
            {t('mobileMethod')} · {t('unavailable')}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">{t('mobileUnavailableDescription')}</p>
        {feedback ? (
          <div
            ref={errorSummaryRef}
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            aria-live={feedback.tone === 'error' ? 'assertive' : 'polite'}
            tabIndex={-1}
            className={feedback.tone === 'error' ? 'text-destructive text-sm' : 'text-sm'}
          >
            {feedback.message}
          </div>
        ) : null}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('email')}</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder={t('emailPlaceholder')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('password')}</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm underline-offset-4 hover:underline">
            {t('forgotPassword')}
          </Link>
        </div>
        <FormField
          control={form.control}
          name="rememberMe"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  aria-label={t('rememberMeOnDevice')}
                />
              </FormControl>
              <FormLabel className="font-normal">{t('rememberMeOnDevice')}</FormLabel>
            </FormItem>
          )}
        />
        <button
          type="submit"
          className="btn btn--accent w-full justify-center"
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('signingIn')}
            </>
          ) : (
            t('signIn')
          )}
        </button>
      </form>
    </Form>
  );
}
