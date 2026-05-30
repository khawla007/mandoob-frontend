'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean(),
});

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export function LoginForm() {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [isNavigating, startTransition] = useTransition();
  const busy = pending || isNavigating;
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  async function onSubmit(values: FormOutput) {
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
          toast.message('Verify your email to continue.');
          setPending(false);
          startRouteProgress();
          startTransition(() => {
            router.replace(`/verify-otp?email=${encodeURIComponent(unverifiedEmail)}`);
          });
          return;
        }
        toast.error(data?.error ?? tErrors('signInFailed'));
        setPending(false);
        return;
      }
      setPending(false);
      startRouteProgress();
      startTransition(() => {
        router.replace(data.redirectTo ?? '/');
        router.refresh();
      });
    } catch {
      toast.error(tErrors('signInFailed'));
      setPending(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('email')}</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder="you@company.com" {...field} />
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
        <FormField
          control={form.control}
          name="rememberMe"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
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
