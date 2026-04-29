'use client';

import { useFormContext } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CreateUserInput, CreateUserRole } from '@/lib/validation/admin-user';
import type { TenantSummary } from '@/lib/data/tenants';

const ROLE_OPTIONS_FOR_SUPER_ADMIN: { value: CreateUserRole; label: string }[] = [
  { value: 'pro', label: 'PRO' },
  { value: 'customer', label: 'Customer' },
  { value: 'employee', label: 'Employee' },
  { value: 'admin', label: 'Admin' },
];
const ROLE_OPTIONS_FOR_ADMIN: { value: CreateUserRole; label: string }[] = [
  { value: 'pro', label: 'PRO' },
  { value: 'customer', label: 'Customer' },
  { value: 'employee', label: 'Employee' },
];

export type CreateUserCommonFieldsProps = {
  callerRole: 'super_admin' | 'admin';
  tenants: TenantSummary[];
  callerTenantId: string | null;
};

export function CreateUserCommonFields({
  callerRole,
  tenants,
  callerTenantId,
}: CreateUserCommonFieldsProps) {
  const form = useFormContext<CreateUserInput>();
  const role = form.watch('role') as CreateUserRole | undefined;
  const showTenantPicker = callerRole === 'super_admin' && role && role !== 'admin';
  const options =
    callerRole === 'super_admin' ? ROLE_OPTIONS_FOR_SUPER_ADMIN : ROLE_OPTIONS_FOR_ADMIN;

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="full_name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Full name</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input type="email" {...field} value={field.value ?? ''} />
            </FormControl>
            <FormDescription>An invite email is sent on submit.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="phone"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Phone (E.164)</FormLabel>
            <FormControl>
              <Input placeholder="+971501234567" {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="role"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Role</FormLabel>
            <Select onValueChange={field.onChange} value={field.value ?? ''}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      {showTenantPicker && (
        <FormField
          control={form.control}
          name="tenant_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tenant</FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? ''}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a tenant" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      {/* admin caller's tenant_id is wired via useForm defaultValues; no hidden
          input needed. The CreateUserForm field-bleed reset preserves it. */}
    </div>
  );
}
