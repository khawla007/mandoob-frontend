'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { RoleEmployeeSchema, type RoleEmployeeInput } from '@/lib/validation/account';
import { updateRoleFieldsAction } from '@/app/account/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Initial = {
  passportNo: string | null;
  visaNo: string | null;
  visaExpiry: string | null;
  emiratesId: string | null;
  eidExpiry: string | null;
};

export function RoleEmployeeForm({ initial }: { initial: Initial }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<RoleEmployeeInput>({
    resolver: zodResolver(RoleEmployeeSchema),
    defaultValues: { passport_no: initial.passportNo ?? undefined },
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const res = await updateRoleFieldsAction(values);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success('Saved');
    });
  });

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      <div className="space-y-1">
        <Label htmlFor="passport_no">Passport number</Label>
        <Input id="passport_no" {...form.register('passport_no')} />
        {form.formState.errors.passport_no && (
          <p role="alert" className="text-destructive text-sm">
            {form.formState.errors.passport_no.message as string}
          </p>
        )}
      </div>

      <section className="space-y-2">
        <h3 className="text-muted-foreground text-sm font-medium">Employer-managed (read-only)</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <ReadOnlyRow label="Visa number" value={initial.visaNo} />
          <ReadOnlyRow label="Visa expiry" value={initial.visaExpiry} />
          <ReadOnlyRow label="Emirates ID" value={initial.emiratesId} />
          <ReadOnlyRow label="EID expiry" value={initial.eidExpiry} />
        </dl>
      </section>

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value ?? '—'}</dd>
    </div>
  );
}
