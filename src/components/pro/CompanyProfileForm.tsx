'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Building2, CheckCircle2, LoaderCircle, Pencil } from 'lucide-react';
import { updateAssignedCompanyProfileAction } from '@/app/(tenant)/t/[tenant]/(pro)/company/actions';
import type { CompanyProfileActionState } from '@/app/(tenant)/t/[tenant]/(pro)/company/actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Labels = {
  title: string;
  description: string;
  companyName: string;
  tradeLicense: string;
  jurisdiction: string;
  licenseExpiry: string;
  save: string;
  saving: string;
  saved: string;
  validation: string;
  notFound: string;
  conflict: string;
  unexpected: string;
  errors: Record<string, string>;
};

type CompanyProfileFormProps = {
  tenantSlug: string;
  company: {
    id: string;
    companyName: string;
    tradeLicenseNo: string | null;
    jurisdiction: string | null;
    licenseExpiry: string | null;
    updatedAt: string;
  };
  labels: Labels;
};

const initialCompanyProfileActionState: CompanyProfileActionState = { status: 'idle' };

export function CompanyProfileForm({ tenantSlug, company, labels }: CompanyProfileFormProps) {
  const action = updateAssignedCompanyProfileAction.bind(null, tenantSlug, company.id);
  const [state, formAction] = useActionState(action, initialCompanyProfileActionState);

  function fieldError(name: keyof NonNullable<typeof state.fieldErrors>) {
    const key = state.fieldErrors?.[name];
    return key ? (labels.errors[key] ?? labels.validation) : null;
  }

  return (
    <Card className="signal-panel overflow-hidden">
      <CardHeader className="border-border/60 border-b">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
            <Building2 className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <CardTitle>{labels.title}</CardTitle>
            <CardDescription>{labels.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-5" noValidate>
          <input
            type="hidden"
            name="expected_updated_at"
            value={state.updatedAt ?? company.updatedAt}
          />
          <div className="grid gap-5 md:grid-cols-2">
            <Field
              id="company-name"
              name="company_name"
              label={labels.companyName}
              defaultValue={company.companyName}
              error={fieldError('company_name')}
              required
              minLength={2}
              maxLength={200}
            />
            <Field
              id="trade-license"
              name="trade_license_no"
              label={labels.tradeLicense}
              defaultValue={company.tradeLicenseNo ?? ''}
              error={fieldError('trade_license_no')}
              maxLength={64}
              dir="ltr"
            />
            <Field
              id="jurisdiction"
              name="jurisdiction"
              label={labels.jurisdiction}
              defaultValue={company.jurisdiction ?? ''}
              error={fieldError('jurisdiction')}
              maxLength={120}
            />
            <Field
              id="license-expiry"
              name="license_expiry"
              label={labels.licenseExpiry}
              defaultValue={company.licenseExpiry ?? ''}
              error={fieldError('license_expiry')}
              type="date"
              dir="ltr"
            />
          </div>

          <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div aria-live="polite" className="min-h-6 text-sm">
              {state.status === 'success' ? (
                <span className="text-signal-success inline-flex items-center gap-2">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {labels.saved}
                </span>
              ) : state.status === 'error' ? (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription>{labels[state.message ?? 'unexpected']}</AlertDescription>
                </Alert>
              ) : null}
            </div>
            <SubmitButton labels={labels} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  error,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; error: string | null }) {
  const errorId = `${id}-error`;
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SubmitButton({ labels }: { labels: Labels }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="min-h-11 w-full sm:min-h-9 sm:w-auto">
      {pending ? (
        <LoaderCircle
          className="size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : (
        <Pencil className="size-4" aria-hidden="true" />
      )}
      {pending ? labels.saving : labels.save}
    </Button>
  );
}
