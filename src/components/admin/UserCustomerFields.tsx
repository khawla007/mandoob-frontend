'use client';

import { useFormContext } from 'react-hook-form';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ClientTypeahead } from './ClientTypeahead';
import type { CreateUserInput } from '@/lib/validation/admin-user';

export function UserCustomerFields() {
  const form = useFormContext<CreateUserInput>();
  const tenantId = (form.watch('tenant_id') as string | null | undefined) ?? null;

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="nationality"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nationality (ISO 2-letter)</FormLabel>
            <FormControl>
              <Input
                placeholder="AE"
                maxLength={2}
                {...field}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value.toUpperCase())}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="passport_no"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Passport number</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="linked_client_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Linked client (optional)</FormLabel>
            <FormControl>
              <ClientTypeahead
                tenantId={tenantId}
                value={(field.value as string | null) ?? null}
                onChange={(id) => field.onChange(id)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
