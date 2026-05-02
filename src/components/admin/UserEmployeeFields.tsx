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

export function UserEmployeeFields() {
  const form = useFormContext<CreateUserInput>();
  const tenantId = (form.watch('tenant_id') as string | null | undefined) ?? null;

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="client_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Employer (client)</FormLabel>
            <FormControl>
              <ClientTypeahead
                tenantId={tenantId}
                value={(field.value as string | null) ?? null}
                onChange={(id) => field.onChange(id)}
                required
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
        name="visa_no"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Visa number</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="visa_expiry"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Visa expiry</FormLabel>
            <FormControl>
              <Input type="date" {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="emirates_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Emirates ID (784-YYYY-NNNNNNN-N)</FormLabel>
            <FormControl>
              <Input placeholder="784-1989-1234567-1" {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="eid_expiry"
        render={({ field }) => (
          <FormItem>
            <FormLabel>EID expiry</FormLabel>
            <FormControl>
              <Input type="date" {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
