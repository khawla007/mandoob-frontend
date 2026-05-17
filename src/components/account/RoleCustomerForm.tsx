'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { RoleCustomerSchema, type RoleCustomerInput } from '@/lib/validation/account';
import { updateRoleFieldsAction } from '@/app/account/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Initial = {
  nationality: string | null;
  passportNo: string | null;
  linkedClientId: string | null;
};

export function RoleCustomerForm({ initial }: { initial: Initial }) {
  const t = useTranslations('account');
  const tCommon = useTranslations('common');
  const [isPending, startTransition] = useTransition();
  const form = useForm<RoleCustomerInput>({
    resolver: zodResolver(RoleCustomerSchema),
    defaultValues: {
      nationality: initial.nationality ?? undefined,
      passport_no: initial.passportNo ?? undefined,
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const res = await updateRoleFieldsAction(values);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(t('saved'));
    });
  });

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      <div className="space-y-1">
        <Label htmlFor="nationality">{t('nationality')}</Label>
        <Input id="nationality" maxLength={2} placeholder="AE" {...form.register('nationality')} />
        {form.formState.errors.nationality && (
          <p role="alert" className="text-destructive text-sm">
            {form.formState.errors.nationality.message as string}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor="passport_no">{t('passportNo')}</Label>
        <Input id="passport_no" {...form.register('passport_no')} />
        {form.formState.errors.passport_no && (
          <p role="alert" className="text-destructive text-sm">
            {form.formState.errors.passport_no.message as string}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <Label>
          {t('linkedCompany')}{' '}
          <span className="text-muted-foreground text-xs">({t('readOnly')})</span>
        </Label>
        <p className="text-muted-foreground text-sm">{initial.linkedClientId ?? '—'}</p>
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? tCommon('saving') : tCommon('save')}
      </Button>
    </form>
  );
}
