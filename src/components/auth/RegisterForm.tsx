'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Circle, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { postJson } from '@/lib/http/post';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { cn } from '@/lib/utils';

const POLICY_VERSION = 'v1';

const usernameRe = /^[a-z0-9_]{3,30}$/;

const schema = z
  .object({
    fullName: z.string().min(1, 'Full name is required'),
    username: z.string().regex(usernameRe, 'Username: 3–30 chars, lowercase, digits, underscore'),
    email: z.string().email('Enter a valid email'),
    phone: z.string().optional().or(z.literal('')),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'Must include an uppercase letter')
      .regex(/[a-z]/, 'Must include a lowercase letter')
      .regex(/[^A-Za-z0-9]/, 'Must include a special character'),
    confirmPassword: z.string(),
    consentAccepted: z.boolean().refine((v) => v === true, { message: 'Consent is required' }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

type PasswordRule = { id: string; label: string; passed: boolean };

function computePasswordRules(pw: string): PasswordRule[] {
  return [
    { id: 'len', label: 'At least 8 characters', passed: pw.length >= 8 },
    { id: 'upper', label: 'An uppercase letter', passed: /[A-Z]/.test(pw) },
    { id: 'lower', label: 'A lowercase letter', passed: /[a-z]/.test(pw) },
    { id: 'special', label: 'A special character', passed: /[^A-Za-z0-9]/.test(pw) },
  ];
}

type UsernameState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'invalid' }
  | { kind: 'available' }
  | { kind: 'taken' };

export function RegisterForm() {
  const [pending, start] = useTransition();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      fullName: '',
      username: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      consentAccepted: false,
    },
  });

  const password = form.watch('password');
  const confirmPassword = form.watch('confirmPassword');
  const username = form.watch('username');

  const rules = useMemo(() => computePasswordRules(password ?? ''), [password]);
  const allRulesPassed = rules.every((r) => r.passed);
  const confirmMatches = (confirmPassword?.length ?? 0) > 0 && confirmPassword === password;

  const [usernameState, setUsernameState] = useState<UsernameState>({ kind: 'idle' });

  const [pwFocused, setPwFocused] = useState(false);
  const [pwDismissed, setPwDismissed] = useState(false);
  const [lingerOpen, setLingerOpen] = useState(false);
  const prevAllPassed = useRef(false);

  useEffect(() => {
    if (allRulesPassed && !prevAllPassed.current && pwFocused && !pwDismissed) {
      setLingerOpen(true);
      const t = setTimeout(() => setLingerOpen(false), 2000);
      prevAllPassed.current = true;
      return () => clearTimeout(t);
    }
    prevAllPassed.current = allRulesPassed;
  }, [allRulesPassed, pwFocused, pwDismissed]);

  const showRules = pwFocused && !pwDismissed && (!allRulesPassed || lingerOpen);

  useEffect(() => {
    const u = (username ?? '').trim().toLowerCase();
    if (!u) {
      setUsernameState({ kind: 'idle' });
      return;
    }
    if (!usernameRe.test(u)) {
      setUsernameState({ kind: 'invalid' });
      return;
    }
    setUsernameState({ kind: 'checking' });
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/auth/check-username?u=${encodeURIComponent(u)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) {
          setUsernameState({ kind: 'idle' });
          return;
        }
        const data = (await res.json()) as { available: boolean };
        setUsernameState({ kind: data.available ? 'available' : 'taken' });
      } catch {
        // aborted or network; ignore
      }
    }, 400);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [username]);

  function onSubmit(values: FormOutput) {
    if (usernameState.kind === 'taken') {
      form.setError('username', { message: 'That username is already taken' });
      return;
    }
    const payload = {
      email: values.email,
      username: values.username.toLowerCase().trim(),
      password: values.password,
      confirmPassword: values.confirmPassword,
      fullName: values.fullName,
      phone: values.phone || undefined,
      consentAccepted: values.consentAccepted,
      policyVersion: POLICY_VERSION,
    };
    start(async () => {
      const res = await postJson('/api/v1/auth/register', payload);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          code?: string;
        } | null;
        if (data?.code === 'USERNAME_TAKEN') {
          form.setError('username', { message: 'That username is already taken' });
        }
        toast.error(data?.error ?? 'Registration failed');
        return;
      }
      window.location.href = `/verify-otp?email=${encodeURIComponent(values.email)}`;
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input
                  autoComplete="username"
                  placeholder="gurmeet_123"
                  {...field}
                  onChange={(e) => field.onChange(e.target.value.toLowerCase())}
                />
              </FormControl>
              <UsernameHint state={usernameState} value={username ?? ''} />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder="you@company.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Phone <span className="text-muted-foreground">(optional)</span>
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
            <FormItem className="relative pb-4">
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete="new-password"
                  {...field}
                  onFocus={() => {
                    setPwFocused(true);
                    setPwDismissed(false);
                  }}
                  onBlur={() => {
                    field.onBlur();
                    setPwFocused(false);
                  }}
                />
              </FormControl>
              {showRules && (
                <PasswordRulesPopover rules={rules} onDismiss={() => setPwDismissed(true)} />
              )}
              <p className="text-destructive absolute top-[80%] left-0 mt-1 text-xs">
                {form.formState.errors.password?.message as string | undefined}
              </p>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem className="relative pb-4">
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <p
                className={cn(
                  'absolute top-[80%] left-0 mt-1 text-xs',
                  confirmPassword
                    ? confirmMatches
                      ? 'text-emerald-600'
                      : 'text-destructive'
                    : 'hidden',
                )}
              >
                {confirmPassword
                  ? confirmMatches
                    ? 'Passwords match.'
                    : 'Passwords do not match.'
                  : ''}
              </p>
            </FormItem>
          )}
        />

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
                />
              </FormControl>
              <div className="space-y-1">
                <FormLabel className="leading-snug font-normal">
                  I agree to the privacy policy and consent to processing of my personal data per
                  UAE PDPL.
                </FormLabel>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full"
          disabled={
            pending ||
            usernameState.kind === 'taken' ||
            usernameState.kind === 'invalid' ||
            usernameState.kind === 'checking'
          }
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creating…
            </>
          ) : (
            'Create account'
          )}
        </Button>
      </form>
    </Form>
  );
}

function PasswordRulesPopover({
  rules,
  onDismiss,
}: {
  rules: PasswordRule[];
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      // onMouseDown preventDefault stops blur on click inside popover
      onMouseDown={(e) => e.preventDefault()}
      className="bg-popover text-popover-foreground border-border absolute top-[80%] left-0 z-20 mt-1 w-full max-w-sm rounded-md border p-3 shadow-md"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss password requirements"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1.5 right-1.5 rounded-sm p-0.5 focus-visible:ring-2 focus-visible:outline-none"
      >
        <X className="size-3.5" />
      </button>
      <div className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
        Password requirements
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
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UsernameHint({ state, value }: { state: UsernameState; value: string }) {
  if (!value) return null;
  if (state.kind === 'checking') {
    return <p className="text-muted-foreground text-xs">Checking availability…</p>;
  }
  if (state.kind === 'available') {
    return (
      <p className="flex items-center gap-1 text-xs text-emerald-600">
        <Check className="size-3.5" aria-hidden /> Available
      </p>
    );
  }
  if (state.kind === 'taken') {
    return <p className="text-destructive text-xs">Already taken</p>;
  }
  return null;
}
