'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Form } from '@/components/ui/form';
import { postJson } from '@/lib/http/post';
import {
  createUserSchema,
  type CreateUserInput,
  type CreateUserOutput,
  type CreateUserRole,
} from '@/lib/validation/admin-user';
import type { TenantSummary } from '@/lib/data/tenants';
import { UserCommonFields } from './UserCommonFields';
import { UserProFields } from './UserProFields';
import { UserCustomerFields } from './UserCustomerFields';
import { UserEmployeeFields } from './UserEmployeeFields';
import { UserAdminFields } from './UserAdminFields';

export type CreateUserFormProps = {
  /**
   * Caller is always a platform user (super_admin or admin) since this lives under
   * /admin/*. Used only to gate which roles can be selected.
   */
  callerRole: 'super_admin' | 'admin';
  tenants: TenantSummary[];
};

const ROLE_TO_SECTION: Record<CreateUserRole, () => React.ReactElement> = {
  pro: () => <UserProFields />,
  customer: () => <UserCustomerFields />,
  employee: () => <UserEmployeeFields />,
  admin: () => <UserAdminFields />,
};

export function CreateUserForm({ callerRole, tenants }: CreateUserFormProps) {
  const router = useRouter();
  const [topError, setTopError] = useState<string | null>(null);

  const form = useForm<CreateUserInput, unknown, CreateUserOutput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      full_name: '',
      email: '',
      phone: '',
      tenant_id: '',
    } as CreateUserInput,
    mode: 'onBlur',
  });

  const role = form.watch('role') as CreateUserRole | undefined;

  // Field-bleed guard: when role flips, reset role-specific fields while
  // preserving common ones. Tenant ID only carries forward for tenant-scoped roles.
  const lastRoleRef = useRef<CreateUserRole | null>(null);
  useEffect(() => {
    if (!role) return;
    if (lastRoleRef.current === role) return;
    lastRoleRef.current = role;
    const common = {
      full_name: form.getValues('full_name'),
      email: form.getValues('email'),
      phone: form.getValues('phone'),
      tenant_id: form.getValues('tenant_id'),
    };
    form.reset({ ...common, role } as CreateUserInput);
  }, [role, form]);

  async function onSubmit(values: CreateUserOutput) {
    setTopError(null);
    const res = await postJson('/api/v1/admin/users', values);
    if (res.ok) {
      const body = (await res.json()) as { userId: string };
      router.push(`/admin/users?created=${body.userId}`);
      return;
    }
    let body: {
      code?: string;
      error?: string;
      details?: { issues?: { path: (string | number)[]; message: string }[] };
    } = {};
    try {
      body = await res.json();
    } catch {
      // ignore — fall through to status text
    }
    const code = body.code ?? 'UNKNOWN';
    if (code === 'EMAIL_TAKEN') {
      form.setError('email', { type: 'server', message: 'Email is already registered' });
      return;
    }
    if (code === 'VALIDATION_FAILED' && body.details?.issues) {
      for (const issue of body.details.issues) {
        const path = issue.path.join('.') as keyof CreateUserInput;
        form.setError(path, { type: 'server', message: issue.message });
      }
      return;
    }
    setTopError(body.error ?? `Request failed (${res.status})`);
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Create user</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <FormProvider {...form}>
            <form
              className="space-y-6"
              onSubmit={form.handleSubmit(onSubmit as (v: CreateUserInput) => Promise<void>)}
            >
              {topError && (
                <Alert variant="destructive">
                  <AlertTitle>Could not create user</AlertTitle>
                  <AlertDescription>{topError}</AlertDescription>
                </Alert>
              )}
              <UserCommonFields mode="create" callerRole={callerRole} tenants={tenants} />
              {role && ROLE_TO_SECTION[role]()}
              <div className="flex gap-2">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Creating…' : 'Create user'}
                </Button>
                <Button type="button" variant="outline" onClick={() => router.push('/admin/users')}>
                  Cancel
                </Button>
              </div>
            </form>
          </FormProvider>
        </Form>
      </CardContent>
    </Card>
  );
}
