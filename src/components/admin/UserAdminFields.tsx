'use client';

import { useFormContext } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import type { CreateUserInput } from '@/lib/validation/admin-user';

export function UserAdminFields() {
  const t = useTranslations('admin');
  const form = useFormContext<CreateUserInput>();
  return (
    <FormField
      control={form.control}
      name="reason"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t('user.fields.reason')}</FormLabel>
          <FormControl>
            <Textarea
              rows={3}
              placeholder={t('user.fields.reasonPlaceholder')}
              {...field}
              value={field.value ?? ''}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
