'use client';

import { useTransition } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { RoleProSchema } from '@/lib/validation/account';
import { updateRoleFieldsAction } from '@/app/account/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type RoleProInput = z.input<typeof RoleProSchema>;
type RoleProOutput = z.output<typeof RoleProSchema>;

type Initial = {
  licenseNo: string | null;
  designation: string | null;
  department: string | null;
  serviceAreas: string[];
  bio: string | null;
};

export function RoleProForm({ initial }: { initial: Initial }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<RoleProInput, unknown, RoleProOutput>({
    resolver: zodResolver(RoleProSchema),
    defaultValues: {
      license_no: initial.licenseNo ?? undefined,
      designation: initial.designation ?? undefined,
      department: initial.department ?? undefined,
      service_areas: initial.serviceAreas,
      bio: initial.bio ?? undefined,
    },
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
    <form onSubmit={onSubmit} className="max-w-xl space-y-4">
      <TextField id="license_no" label="License number" form={form} />
      <TextField id="designation" label="Designation" form={form} />
      <TextField id="department" label="Department" form={form} />
      <div className="space-y-1">
        <Label htmlFor="service_areas">Service areas (comma-separated)</Label>
        <Input
          id="service_areas"
          defaultValue={initial.serviceAreas.join(', ')}
          onChange={(e) =>
            form.setValue(
              'service_areas',
              e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
              { shouldValidate: true },
            )
          }
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" rows={4} {...form.register('bio')} />
        {form.formState.errors.bio && (
          <p role="alert" className="text-destructive text-sm">
            {form.formState.errors.bio.message as string}
          </p>
        )}
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}

function TextField({
  id,
  label,
  form,
}: {
  id: 'license_no' | 'designation' | 'department';
  label: string;
  form: UseFormReturn<RoleProInput, unknown, RoleProOutput>;
}) {
  const err = form.formState.errors[id]?.message as string | undefined;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...form.register(id)} aria-describedby={`${id}_err`} />
      {err && (
        <p id={`${id}_err`} role="alert" className="text-destructive text-sm">
          {err}
        </p>
      )}
    </div>
  );
}
