'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Form } from '@/components/ui/form';
import { postJson } from '@/lib/http/post';
import {
  editUserSchema,
  type EditUserInput,
  type EditUserOutput,
  type CreateUserRole,
  SERVICE_AREA_VALUES,
} from '@/lib/validation/admin-user';
import { UserCommonFields } from './UserCommonFields';
import { UserProFields } from './UserProFields';
import { UserCustomerFields } from './UserCustomerFields';
import { UserEmployeeFields } from './UserEmployeeFields';
import { UserAdminFields } from './UserAdminFields';
import type { EditableUser } from '@/lib/data/admin-read-user';

const ROLE_TO_SECTION: Record<CreateUserRole, () => React.ReactElement> = {
  pro: () => <UserProFields />,
  customer: () => <UserCustomerFields />,
  employee: () => <UserEmployeeFields />,
  admin: () => <UserAdminFields />,
};

function buildDefaults(user: EditableUser): EditUserInput {
  const { profile } = user;
  if (user.role === 'pro') {
    return {
      full_name: profile.fullName ?? '',
      phone: profile.phone ?? '',
      tenant_id: profile.tenantId ?? '',
      role: 'pro',
      license_no: user.pro.licenseNo ?? '',
      designation: user.pro.designation ?? '',
      department: user.pro.department ?? '',
      service_areas: (user.pro.serviceAreas as (typeof SERVICE_AREA_VALUES)[number][]) ?? [],
      bio: user.pro.bio ?? '',
    };
  }
  if (user.role === 'customer') {
    return {
      full_name: profile.fullName ?? '',
      phone: profile.phone ?? '',
      tenant_id: profile.tenantId ?? '',
      role: 'customer',
      nationality: user.customer.nationality ?? '',
      passport_no: user.customer.passportNo ?? '',
      linked_client_id: user.customer.linkedClientId ?? null,
    };
  }
  if (user.role === 'employee') {
    return {
      full_name: profile.fullName ?? '',
      phone: profile.phone ?? '',
      tenant_id: profile.tenantId ?? '',
      role: 'employee',
      client_id: user.employee.clientId,
      passport_no: user.employee.passportNo ?? '',
      visa_no: user.employee.visaNo ?? '',
      visa_expiry: user.employee.visaExpiry ?? '',
      emirates_id: user.employee.emiratesId ?? '',
      eid_expiry: user.employee.eidExpiry ?? '',
    };
  }
  // admin (super_admin not editable here, but type-narrow safe)
  return {
    full_name: profile.fullName ?? '',
    phone: profile.phone ?? '',
    role: 'admin',
  } as EditUserInput;
}

export type EditUserFormProps = {
  user: EditableUser;
  callerRole: 'super_admin' | 'admin';
  tenantName: string | null;
};

export function EditUserForm({ user, callerRole, tenantName }: EditUserFormProps) {
  const router = useRouter();
  const [topError, setTopError] = useState<string | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);

  const form = useForm<EditUserInput, unknown, EditUserOutput>({
    resolver: zodResolver(editUserSchema),
    defaultValues: buildDefaults(user),
    mode: 'onBlur',
  });

  const role = user.profile.role as CreateUserRole;

  async function onSubmit(values: EditUserOutput) {
    setTopError(null);
    setSavedOnce(false);
    const res = await postJson(`/api/v1/admin/users/${user.profile.id}`, values, {
      method: 'PATCH',
    });
    if (res.ok) {
      setSavedOnce(true);
      router.refresh();
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
      // ignore
    }
    if (body.code === 'VALIDATION_FAILED' && body.details?.issues) {
      for (const issue of body.details.issues) {
        const path = issue.path.join('.') as keyof EditUserInput;
        form.setError(path, { type: 'server', message: issue.message });
      }
      return;
    }
    setTopError(body.error ?? `Request failed (${res.status})`);
  }

  // Edit form does not show admin/super_admin field-level edits beyond common
  // (no per-role admin section). Hide section entirely for super_admin (not
  // role-changeable from this UI either).
  const ShowSection = user.profile.role !== 'super_admin' && role && ROLE_TO_SECTION[role];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile details</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <FormProvider {...form}>
            <form
              className="space-y-6"
              onSubmit={form.handleSubmit(onSubmit as (v: EditUserInput) => Promise<void>)}
            >
              {topError && (
                <Alert variant="destructive">
                  <AlertTitle>Could not save changes</AlertTitle>
                  <AlertDescription>{topError}</AlertDescription>
                </Alert>
              )}
              {savedOnce && !topError && (
                <Alert>
                  <AlertTitle>Saved</AlertTitle>
                  <AlertDescription>Profile updated.</AlertDescription>
                </Alert>
              )}
              <UserCommonFields
                mode="edit"
                callerRole={callerRole}
                tenants={[]}
                email={user.profile.email}
                tenantName={tenantName}
              />
              {ShowSection ? ShowSection() : null}
              <div className="flex gap-2">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Saving…' : 'Save changes'}
                </Button>
                <Button type="button" variant="outline" onClick={() => router.push('/admin/users')}>
                  Back
                </Button>
              </div>
            </form>
          </FormProvider>
        </Form>
      </CardContent>
    </Card>
  );
}
