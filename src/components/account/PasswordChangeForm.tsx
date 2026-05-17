'use client';

import { useTransition } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { PasswordChangeSchema, type PasswordChangeInput } from '@/lib/validation/account';
import { changePasswordAction } from '@/app/account/actions';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { Label } from '@/components/ui/label';

export function PasswordChangeForm() {
  const tAuth = useTranslations('auth');
  const tAccount = useTranslations('account');
  const tCommon = useTranslations('common');
  const [isPending, startTransition] = useTransition();
  const form = useForm<PasswordChangeInput>({
    resolver: zodResolver(PasswordChangeSchema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const res = await changePasswordAction(values);
      if (!res.ok) {
        if (res.error.code === 'REAUTH_FAILED') {
          form.setError('current_password', { message: res.error.message });
          return;
        }
        toast.error(res.error.message);
        return;
      }
      form.reset();
      toast.success(tAccount('passwordChanged'));
    });
  });

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      <Field id="current_password" label={tAuth('currentPassword')} form={form} />
      <Field id="new_password" label={tAuth('newPassword')} form={form} />
      <Field id="confirm_password" label={tAuth('confirmPassword')} form={form} />
      <p className="text-muted-foreground text-xs">{tAccount('passwordPolicyHint')}</p>
      <Button type="submit" disabled={isPending}>
        {isPending ? tCommon('saving') : tAccount('changePassword')}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  form,
}: {
  id: keyof PasswordChangeInput;
  label: string;
  form: UseFormReturn<PasswordChangeInput>;
}) {
  const err = form.formState.errors[id]?.message as string | undefined;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <PasswordInput
        id={id}
        autoComplete="new-password"
        {...form.register(id)}
        aria-describedby={`${id}_err`}
      />
      {err && (
        <p id={`${id}_err`} role="alert" className="text-destructive text-sm">
          {err}
        </p>
      )}
    </div>
  );
}
