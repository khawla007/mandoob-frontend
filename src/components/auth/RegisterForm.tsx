'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Circle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { postJson } from '@/lib/http/post';
import { startRouteProgress } from '@/components/navigation/RouteProgress';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { cn } from '@/lib/utils';
import {
  claimAuthSubmission,
  registrationFailureCategory,
  releaseAuthSubmission,
  createRegistrationFormSchema,
  buildRegistrationPayload,
} from '@/components/auth/auth-form-state';

type FormInput = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  consentAccepted: boolean;
};

type PasswordRule = { id: string; labelKey: string; passed: boolean };

function computePasswordRules(pw: string): PasswordRule[] {
  return [
    { id: 'len', labelKey: 'pwRuleLength', passed: pw.length >= 8 },
    { id: 'upper', labelKey: 'pwRuleUppercase', passed: /[A-Z]/.test(pw) },
    { id: 'lower', labelKey: 'pwRuleLowercase', passed: /[a-z]/.test(pw) },
    { id: 'special', labelKey: 'pwRuleSpecial', passed: /[^A-Za-z0-9]/.test(pw) },
  ];
}

export function RegisterForm() {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const submissionLatch = useRef(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'status'; message: string } | null>(
    null,
  );
  const schema = useMemo(
    () =>
      createRegistrationFormSchema({
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
    mode: 'onTouched',
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      consentAccepted: false,
    },
  });

  const password = useWatch({ control: form.control, name: 'password' });
  const confirmPassword = useWatch({ control: form.control, name: 'confirmPassword' });

  const rules = useMemo(() => computePasswordRules(password ?? ''), [password]);
  const allRulesPassed = rules.every((r) => r.passed);
  const confirmMatches = (confirmPassword?.length ?? 0) > 0 && confirmPassword === password;

  function safeRegistrationError(code: string | undefined): string {
    switch (registrationFailureCategory(code)) {
      case 'validation':
        return tErrors('fixHighlighted');
      case 'rateLimited':
        return tErrors('longCopy.rateLimited');
      case 'sessionRefreshRequired':
        return t('sessionRefreshRequired');
      case 'humanVerificationFailed':
        return t('humanVerificationFailed');
      case 'duplicateSafe':
        return t('registrationDuplicateSafe');
      case 'verificationDeliveryFailed':
        return t('verificationDeliveryFailed');
      default:
        return tErrors('registrationFailed');
    }
  }

  function showError(message: string) {
    setFeedback({ tone: 'error', message });
    requestAnimationFrame(() => errorSummaryRef.current?.focus());
  }

  async function onSubmit(values: FormInput) {
    if (!claimAuthSubmission(submissionLatch)) return;
    setFeedback(null);
    const payload = buildRegistrationPayload(values);
    setPending(true);
    try {
      const res = await postJson('/api/v1/auth/register', payload);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          code?: string;
        } | null;
        showError(safeRegistrationError(data?.code));
        releaseAuthSubmission(submissionLatch);
        setPending(false);
        return;
      }
      setFeedback({ tone: 'status', message: t('verificationHandoff') });
      startRouteProgress();
      router.replace(`/verify-otp?email=${encodeURIComponent(values.email)}`);
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
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('fullName')}</FormLabel>
                <FormControl>
                  <Input autoComplete="name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

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
        </div>

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t('phone')} <span className="text-muted-foreground">({t('optional')})</span>
              </FormLabel>
              <FormControl>
                <Input type="tel" autoComplete="tel" placeholder="+971501234567" {...field} />
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
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('confirmPassword')}</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <p
                role="status"
                className={cn(
                  'text-xs',
                  confirmPassword
                    ? confirmMatches
                      ? 'text-emerald-600'
                      : 'text-destructive'
                    : 'hidden',
                )}
              >
                {confirmPassword
                  ? confirmMatches
                    ? t('passwordsMatch')
                    : tErrors('passwordMismatch')
                  : ''}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <PasswordRequirements rules={rules} allPassed={allRulesPassed} t={t} />

        <FormField
          control={form.control}
          name="consentAccepted"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-2 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  className="mt-0.5"
                  aria-label={t('consentLabel')}
                />
              </FormControl>
              <div className="space-y-1">
                <FormLabel className="leading-snug font-normal">{t('consentLabel')}</FormLabel>
                <FormDescription>
                  {t('consentPrefix')}{' '}
                  <Link href="/legal/terms" className="underline underline-offset-2">
                    {t('termsOfService')}
                  </Link>{' '}
                  {t('consentAnd')}{' '}
                  <Link href="/legal/privacy" className="underline underline-offset-2">
                    {t('privacyNotice')}
                  </Link>
                  {t('consentSuffix')}
                </FormDescription>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />

        <button
          type="submit"
          className="btn btn--accent w-full justify-center"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('creating')}
            </>
          ) : (
            t('createAccount')
          )}
        </button>
      </form>
    </Form>
  );
}

function PasswordRequirements({
  rules,
  allPassed,
  t,
}: {
  rules: PasswordRule[];
  allPassed: boolean;
  t: ReturnType<typeof useTranslations<'auth'>>;
}) {
  return (
    <div
      className="bg-muted/40 border-border rounded-md border p-3"
      aria-labelledby="password-requirements-title"
    >
      <div className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
        <span id="password-requirements-title">{t('passwordRequirements')}</span>
        <span className="ms-2 normal-case" role="status" aria-live="polite">
          {allPassed ? t('passwordRequirementsMet') : t('passwordRequirementsPending')}
        </span>
      </div>
      <ul className="space-y-1">
        {rules.map((r) => (
          <li
            key={r.id}
            className={cn(
              'flex items-center gap-2 text-xs transition-colors',
              r.passed ? 'text-emerald-600' : 'text-muted-foreground',
            )}
          >
            {r.passed ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <Circle className="size-3.5" aria-hidden />
            )}
            <span>{t(r.labelKey as Parameters<typeof t>[0])}</span>
            <span className="visually-hidden">
              {r.passed ? t('requirementMet') : t('requirementNotMet')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
