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
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import type { CreateUserInput } from '@/lib/validation/admin-user';
import { SERVICE_AREA_VALUES } from '@/lib/validation/admin-user';

export function CreateUserProFields() {
  const form = useFormContext<CreateUserInput>();
  const selected = (form.watch('service_areas') as string[] | undefined) ?? [];

  function toggle(area: string) {
    const next = selected.includes(area)
      ? selected.filter((s) => s !== area)
      : [...selected, area];
    form.setValue('service_areas', next as never, { shouldValidate: true });
  }

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="license_no"
        render={({ field }) => (
          <FormItem>
            <FormLabel>License number</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="designation"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Designation</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="department"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Department</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormItem>
        <FormLabel>Service areas</FormLabel>
        <div className="flex flex-wrap gap-2">
          {SERVICE_AREA_VALUES.map((area) => (
            <Toggle
              key={area}
              type="button"
              pressed={selected.includes(area)}
              onPressedChange={() => toggle(area)}
              variant="outline"
              size="sm"
            >
              {area.replace(/_/g, ' ')}
            </Toggle>
          ))}
        </div>
        <FormMessage />
      </FormItem>
      <FormField
        control={form.control}
        name="bio"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Bio</FormLabel>
            <FormControl>
              <Textarea rows={4} {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
