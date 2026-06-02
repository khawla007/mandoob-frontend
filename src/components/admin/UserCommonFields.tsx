'use client';

import { useFormContext } from 'react-hook-form';
import { useTranslations } from 'next-intl';
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

const ALL_ROLE_OPTIONS: { value: CreateUserRole }[] = [
  { value: 'pro' },
  { value: 'customer' },
  { value: 'employee' },
  { value: 'admin' },
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
  const t = useTranslations('admin');
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
            <FormLabel>{t('user.fields.fullName')}</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {isEdit ? (
        <FormItem>
          <FormLabel>{t('user.fields.email')}</FormLabel>
          <FormControl>
            <Input type="email" value={email ?? ''} disabled readOnly />
          </FormControl>
          <FormDescription>{t('user.fields.emailImmutable')}</FormDescription>
        </FormItem>
      ) : (
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('user.fields.email')}</FormLabel>
              <FormControl>
                <Input type="email" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormDescription>{t('user.fields.inviteEmailSent')}</FormDescription>
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
            <FormLabel>{t('user.fields.phone')}</FormLabel>
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
            <FormLabel>{t('user.fields.role')}</FormLabel>
            <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isEdit}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={t('user.fields.chooseRole')} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {t(`enums.role.${o.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEdit ? <FormDescription>{t('user.fields.changeRoleHint')}</FormDescription> : null}
            <FormMessage />
          </FormItem>
        )}
      />
      {isEdit && isTenantScoped ? (
        <FormItem>
          <FormLabel>{t('user.fields.tenant')}</FormLabel>
          <FormControl>
            <Input value={tenantName ?? ''} disabled readOnly />
          </FormControl>
          <FormDescription>{t('user.fields.tenantImmutable')}</FormDescription>
        </FormItem>
      ) : null}
      {showTenantPicker && (
        <FormField
          control={form.control}
          name="tenant_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('user.fields.tenant')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? ''}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t('user.fields.chooseTenant')} />
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
