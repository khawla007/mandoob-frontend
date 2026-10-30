'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import {
  updateEmployeeProfileAction,
  type EmployeeProfileActionState,
} from '@/app/(tenant)/t/[tenant]/(employee)/employee/settings/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initialState: EmployeeProfileActionState = { status: 'idle' };

export function EmployeePhoneForm({
  slug,
  phone,
  version,
  operationId,
}: {
  slug: string;
  phone: string | null;
  version: number;
  operationId: string;
}) {
  const t = useTranslations('p308.employeeSelf');
  const [state, action, pending] = useActionState(
    updateEmployeeProfileAction.bind(null, slug),
    initialState,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="operation_id" value={operationId} />
      <input type="hidden" name="expected_version" value={version} />
      <div className="grid gap-1">
        <Label htmlFor="employee-phone">{t('phone')}</Label>
        <Input
          id="employee-phone"
          name="phone"
          type="tel"
          dir="ltr"
          autoComplete="tel"
          defaultValue={phone ?? ''}
          disabled={pending}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? t('saving') : t('save')}
      </Button>
      {state.status !== 'idle' ? (
        <p
          role="status"
          aria-live="polite"
          className={state.status === 'success' ? 'text-sm' : 'text-destructive text-sm'}
        >
          {t(state.status)}
        </p>
      ) : null}
    </form>
  );
}
