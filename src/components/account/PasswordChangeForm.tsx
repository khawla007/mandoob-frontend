'use client';

import { useTransition } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { PasswordChangeSchema, type PasswordChangeInput } from '@/lib/validation/account';
import { changePasswordAction } from '@/app/account/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PasswordChangeForm() {
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
      toast.success('Password changed');
    });
  });

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      <Field id="current_password" label="Current password" type="password" form={form} />
      <Field
        id="new_password"
        label="New password (≥10 chars, mixed case + digit)"
        type="password"
        form={form}
      />
      <Field id="confirm_password" label="Confirm new password" type="password" form={form} />
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Change password'}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  type,
  form,
}: {
  id: keyof PasswordChangeInput;
  label: string;
  type: string;
  form: UseFormReturn<PasswordChangeInput>;
}) {
  const err = form.formState.errors[id]?.message as string | undefined;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
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
