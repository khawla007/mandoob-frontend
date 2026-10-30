'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createEmployeeAction,
  setEmployeeStatusAction,
  updateEmployeeAction,
} from '@/app/(tenant)/t/[tenant]/(pro)/employees/actions';
import type { EmployeeRegistryRow } from '@/lib/data/pro-employee-registry';

const TEXT_FIELDS = ['name', 'email', 'phone', 'nationality', 'job_title'] as const;
const IDENTIFIER_FIELDS = ['passport_no', 'visa_no', 'emirates_id'] as const;
type Field =
  | (typeof TEXT_FIELDS)[number]
  | (typeof IDENTIFIER_FIELDS)[number]
  | 'visa_expiry'
  | 'eid_expiry';

function initialValues(row?: EmployeeRegistryRow): Record<Field, string> {
  return {
    name: row?.name ?? '',
    email: row?.email ?? '',
    phone: row?.phone ?? '',
    nationality: row?.nationality ?? '',
    job_title: row?.jobTitle ?? '',
    passport_no: '',
    visa_no: '',
    emirates_id: '',
    visa_expiry: row?.visaExpiry ?? '',
    eid_expiry: row?.eidExpiry ?? '',
  };
}

/** Create (no row) or edit (row) an employee; identifiers are write-only and shown masked. */
export function EmployeeFormDialog({ slug, row }: { slug: string; row?: EmployeeRegistryRow }) {
  const t = useTranslations('p308.employees');
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={row ? 'outline' : 'default'} size={row ? 'sm' : 'default'}>
          {row ? t('edit') : t('add')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {open ? (
          <EmployeeForm
            key={row ? `${row.id}:${row.version}` : 'new'}
            slug={slug}
            row={row}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EmployeeForm({
  slug,
  row,
  onClose,
}: {
  slug: string;
  row?: EmployeeRegistryRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const t = useTranslations('p308.employees');
  const errors = useTranslations('p308.errors');
  const [operationId] = useState(() => crypto.randomUUID());
  const [values, setValues] = useState(() => initialValues(row));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const initial = initialValues(row);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const changed: Record<string, string | null> = {};
    for (const field of Object.keys(values) as Field[]) {
      const value = values[field].trim();
      const isIdentifier = (IDENTIFIER_FIELDS as readonly string[]).includes(field);
      if (isIdentifier && value === '') continue;
      if (row && !isIdentifier && value === initial[field]) continue;
      if (!row && value === '') continue;
      changed[field] = value === '' ? null : value;
    }
    if (row && Object.keys(changed).length === 0) {
      onClose();
      return;
    }
    startTransition(async () => {
      const result = row
        ? await updateEmployeeAction(slug, {
            operation_id: operationId,
            employee_id: row.id,
            expected_version: row.version,
            patch: changed,
          })
        : await createEmployeeAction(slug, { operation_id: operationId, ...changed });
      if (!result.ok) {
        setError(errors.has(result.code) ? errors(result.code) : errors('INTERNAL'));
        return;
      }
      onClose();
      router.refresh();
    });
  }

  const field = (name: Field, type = 'text', placeholder?: string) => (
    <div className="grid gap-1" key={name}>
      <Label htmlFor={`employee-${name}`}>{t(`fields.${name}`)}</Label>
      <Input
        id={`employee-${name}`}
        type={type}
        autoComplete="off"
        required={name === 'name'}
        placeholder={placeholder}
        value={values[name]}
        onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
      />
    </div>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{row ? t('editTitle') : t('addTitle')}</DialogTitle>
        <DialogDescription>{t('privacyNote')}</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {TEXT_FIELDS.map((name) => field(name, name === 'email' ? 'email' : 'text'))}
          {field('passport_no', 'text', row?.passportMasked ?? undefined)}
          {field('visa_no', 'text', row?.visaMasked ?? undefined)}
          {field('visa_expiry', 'date')}
          {field('emirates_id', 'text', row?.eidMasked ?? '784-YYYY-NNNNNNN-N')}
          {field('eid_expiry', 'date')}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            {t('close')}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function EmployeeStatusButton({ slug, row }: { slug: string; row: EmployeeRegistryRow }) {
  const router = useRouter();
  const t = useTranslations('p308.employees');
  const errors = useTranslations('p308.errors');
  const [operationId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (row.status === 'terminated') return null;
  const next = row.status === 'active' ? 'inactive' : 'active';
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setEmployeeStatusAction(slug, {
              operation_id: operationId,
              employee_id: row.id,
              expected_version: row.version,
              status: next,
            });
            if (!result.ok) {
              setMessage(errors.has(result.code) ? errors(result.code) : errors('INTERNAL'));
              return;
            }
            router.refresh();
          })
        }
      >
        {next === 'inactive' ? t('deactivate') : t('reactivate')}
      </Button>
      {message ? (
        <p role="alert" className="text-destructive text-xs">
          {message}
        </p>
      ) : null}
    </div>
  );
}
