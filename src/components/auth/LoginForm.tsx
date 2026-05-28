'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { postJson } from '@/lib/http/post';
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
  const [pending, start] = useTransition();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  function onSubmit(values: FormOutput) {
    start(async () => {
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
          toast.message('Verify your email to continue.');
          window.location.href = `/verify-otp?email=${encodeURIComponent(data.details.email)}`;
          return;
        }
        toast.error(data?.error ?? tErrors('signInFailed'));
        return;
      }
      window.location.href = data.redirectTo ?? '/';
    });
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
        <button type="submit" className="btn btn--accent w-full justify-center" disabled={pending}>
          {pending ? (
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
