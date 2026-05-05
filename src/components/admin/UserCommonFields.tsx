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

// The component is shared between create and edit. Both forms supply the
// same field names for the parts touched here, so we type the form context
// with CreateUserInput; the email field is conditionally rendered.
type FormShape = CreateUserInput;

const ALL_ROLE_OPTIONS: { value: CreateUserRole; label: string }[] = [
  { value: 'pro', label: 'PRO' },
  { value: 'customer', label: 'Customer' },
  { value: 'employee', label: 'Employee' },
  { value: 'admin', label: 'Admin' },
];

export type UserCommonFieldsProps = {
  mode: 'create' | 'edit';
  /**
   * Role of the signed-in caller. Both values are platform-scoped post role-rebase;
   * this is used only to gate the `admin` role option (only super_admin can create
   * other platform admins).
   */
  callerRole: 'super_admin' | 'admin';
  tenants: TenantSummary[];
  /** Required in edit mode — rendered as disabled input. */
  email?: string | null;
  /** Required in edit mode for tenant-scoped profiles — rendered as disabled name. */
  tenantName?: string | null;
};

// Roles that live inside a tenant. Selecting any of these requires picking a tenant.
const TENANT_SCOPED_ROLES: ReadonlyArray<CreateUserRole> = ['pro', 'customer', 'employee'];

export function UserCommonFields({
  mode,
  callerRole,
  tenants,
  email,
  tenantName,
}: UserCommonFieldsProps) {
  const form = useFormContext<FormShape>();
  const role = form.watch('role') as CreateUserRole | undefined;
  const isEdit = mode === 'edit';
  const isTenantScoped = role !== undefined && TENANT_SCOPED_ROLES.includes(role);
  // Tenant picker visibility is driven purely by the selected role: tenant-scoped
  // roles need a tenant; platform roles (admin, super_admin) do not.
  const showTenantPicker = !isEdit && isTenantScoped;
  // Only super_admin may create another platform admin.
  const options =
    callerRole === 'super_admin'
      ? ALL_ROLE_OPTIONS
      : ALL_ROLE_OPTIONS.filter((o) => o.value !== 'admin');

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
      {isEdit ? (
        <FormItem>
          <FormLabel>Email</FormLabel>
          <FormControl>
            <Input type="email" value={email ?? ''} disabled readOnly />
          </FormControl>
          <FormDescription>
            Email is immutable here. Use the dedicated email-change flow.
          </FormDescription>
        </FormItem>
      ) : (
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
      )}
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
            <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isEdit}>
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
            {isEdit ? (
              <FormDescription>
                Use Change role action to change role; sessions revoke on save.
              </FormDescription>
            ) : null}
            <FormMessage />
          </FormItem>
        )}
      />
      {isEdit && isTenantScoped ? (
        <FormItem>
          <FormLabel>Tenant</FormLabel>
          <FormControl>
            <Input value={tenantName ?? ''} disabled readOnly />
          </FormControl>
          <FormDescription>Tenant cannot be moved from this form.</FormDescription>
        </FormItem>
      ) : null}
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
    </div>
  );
}
