'use client';

import { useFormContext } from 'react-hook-form';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import type { CreateUserInput } from '@/lib/validation/admin-user';

export function UserAdminFields() {
  const form = useFormContext<CreateUserInput>();
  return (
    <FormField
      control={form.control}
      name="reason"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Reason (optional)</FormLabel>
          <FormControl>
            <Textarea
              rows={3}
              placeholder="Recorded in admin_audit_actions for traceability"
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
