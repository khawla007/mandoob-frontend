'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  ProfileBaseSchema,
  ProfilePhoneSchema,
  type ProfileBaseInput,
  type ProfilePhoneInput,
} from '@/lib/validation/account';
import { updateProfileAction } from '@/app/account/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Role } from '@/lib/auth/roles';

type Props = {
  initial: { display_name: string; phone: string };
  role: Role;
  readOnly: { email: string; role: Role; tenantId: string | null; createdAt: string | null };
};

type FormValues = ProfileBaseInput | ProfilePhoneInput;

export function ProfileForm({ initial, role, readOnly }: Props) {
  const t = useTranslations('account');
  const tCommon = useTranslations('common');
  const showsPhone = role === 'customer' || role === 'employee';
  const schema = showsPhone ? ProfilePhoneSchema : ProfileBaseSchema;
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: showsPhone
      ? { display_name: initial.display_name, phone: initial.phone }
      : { display_name: initial.display_name },
  });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const res = await updateProfileAction(values);
      if (!res.ok) {
        setServerError(res.error.message);
        toast.error(res.error.message);
        return;
      }
      toast.success(res.data?.changedKeys.length ? t('profileSaved') : t('noChanges'));
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t('editable')}</h2>
        <div className="space-y-1">
          <Label htmlFor="display_name">{t('displayName')}</Label>
          <Input
            id="display_name"
            {...form.register('display_name')}
            aria-describedby="display_name_err"
          />
          {form.formState.errors.display_name && (
            <p id="display_name_err" role="alert" className="text-destructive text-sm">
              {form.formState.errors.display_name.message}
            </p>
          )}
        </div>
        {showsPhone && (
          <div className="space-y-1">
            <Label htmlFor="phone">{t('phone')} (E.164)</Label>
            <Input
              id="phone"
              placeholder="+971501234567"
              {...form.register('phone' as const)}
              aria-describedby="phone_err"
            />
            {'phone' in form.formState.errors && form.formState.errors.phone && (
              <p id="phone_err" role="alert" className="text-destructive text-sm">
                {form.formState.errors.phone.message as string}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t('readOnly')}</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t('email')}</dt>
            <dd>{readOnly.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('role')}</dt>
            <dd>{readOnly.role}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('tenant')}</dt>
            <dd>{readOnly.tenantId ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('created')}</dt>
            <dd>{readOnly.createdAt ?? '—'}</dd>
          </div>
        </dl>
      </section>

      {serverError && (
        <p role="alert" className="text-destructive text-sm">
          {serverError}
        </p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? tCommon('saving') : t('saveChanges')}
      </Button>
    </form>
  );
}
