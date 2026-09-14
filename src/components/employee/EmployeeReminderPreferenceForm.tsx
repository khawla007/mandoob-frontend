'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';

import {
  updateEmployeeReminderPreferenceAction,
  type EmployeeReminderActionState,
} from '@/app/(tenant)/t/[tenant]/(employee)/employee/settings/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

const initialState: EmployeeReminderActionState = { status: 'idle' };

export function EmployeeReminderPreferenceForm({
  slug,
  enabled,
}: {
  slug: string;
  enabled: boolean | null;
}) {
  const t = useTranslations('employee.settings');
  const action = updateEmployeeReminderPreferenceAction.bind(null, slug);
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Checkbox
            id="renewal_reminders_enabled"
            name="renewal_reminders_enabled"
            defaultChecked={enabled === true}
            disabled={pending}
          />
          <div className="grid gap-1">
            <Label htmlFor="renewal_reminders_enabled">{t('remindersLabel')}</Label>
            <p className="text-muted-foreground text-sm leading-6">{t('remindersDescription')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={enabled === true ? 'default' : 'secondary'}>
            {enabled === null ? t('unavailable') : enabled ? t('enabled') : t('disabled')}
          </Badge>
          <Button type="submit" disabled={pending}>
            {pending ? t('saving') : t('save')}
          </Button>
        </div>
      </div>
      {state.status !== 'idle' ? (
        <p
          role="status"
          aria-live="polite"
          className={state.status === 'error' ? 'text-destructive text-sm' : 'text-sm'}
        >
          {state.status === 'success' ? t('success') : t('error')}
        </p>
      ) : null}
    </form>
  );
}
