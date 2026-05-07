'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Calculator, Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  AddOn,
  EstimateInput,
  EstimateOutput,
  Jurisdiction,
  LegalStructure,
  OfficeType,
} from '@/lib/estimator';

type AuthorityOption = {
  authority: string;
  jurisdiction: Jurisdiction;
  emirate: string | null;
};

type EstimateResponse = {
  estimate: EstimateOutput;
  handoffUrl: string;
};

const JURISDICTION_LABELS: Record<Jurisdiction, string> = {
  mainland: 'Mainland',
  free_zone: 'Free Zone',
  offshore: 'Offshore',
};

const LEGAL_STRUCTURES: { value: LegalStructure; label: string }[] = [
  { value: 'fz_llc', label: 'FZ-LLC / FZE' },
  { value: 'llc', label: 'Mainland LLC' },
  { value: 'branch', label: 'Branch' },
  { value: 'offshore_company', label: 'Offshore company' },
];

const OFFICE_TYPES: { value: OfficeType; label: string }[] = [
  { value: 'flexi', label: 'Flexi desk' },
  { value: 'none', label: 'No office' },
];

const ADD_ONS: { value: AddOn; label: string }[] = [
  { value: 'bank_account', label: 'Bank account assistance' },
  { value: 'tax_registration', label: 'Corporate tax registration' },
  { value: 'document_attestation', label: 'Document attestation' },
];

const DOCUMENT_LABELS: Record<string, string> = {
  attested_documents: 'Attested corporate documents',
  business_plan: 'Business plan or activity summary',
  lease_agreement: 'Lease or flexi desk confirmation',
  medical_fitness: 'Medical fitness and Emirates ID documents',
  passport: 'Passport copy',
  photo: 'Passport photo',
  shareholder_resolution: 'Shareholder resolution',
  trade_license: 'Trade license copy',
};

const ACTIVITY_OPTIONS = [{ value: 'consulting', label: 'Consulting / professional services' }];

export function CostEstimator({ authorities }: { authorities: AuthorityOption[] }) {
  const [input, setInput] = useState<EstimateInput>(() => ({
    jurisdiction: 'free_zone',
    authority: authorities.find((a) => a.jurisdiction === 'free_zone')?.authority ?? authorities[0]?.authority ?? '',
    emirate: authorities.find((a) => a.jurisdiction === 'free_zone')?.emirate ?? null,
    activityKey: 'consulting',
    shareholderCount: 1,
    visaCount: 1,
    legalStructure: 'fz_llc',
    officeType: 'flexi',
    addOns: ['bank_account'],
  }));
  const [quote, setQuote] = useState<EstimateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const authorityOptions = useMemo(
    () => authorities.filter((authority) => authority.jurisdiction === input.jurisdiction),
    [authorities, input.jurisdiction],
  );
  const legalStructureOptions = useMemo(
    () => LEGAL_STRUCTURES.filter((structure) => legalStructureAllowed(input.jurisdiction, structure.value)),
    [input.jurisdiction],
  );
  const officeTypeOptions = useMemo(
    () => OFFICE_TYPES.filter((office) => input.jurisdiction !== 'offshore' || office.value === 'none'),
    [input.jurisdiction],
  );

  function patch(next: Partial<EstimateInput>) {
    setQuote(null);
    setError(null);
    setInput((current) => ({ ...current, ...next }));
  }

  function setJurisdiction(jurisdiction: Jurisdiction) {
    const firstAuthority = authorities.find((authority) => authority.jurisdiction === jurisdiction);
    patch({
      jurisdiction,
      authority: firstAuthority?.authority ?? '',
      emirate: firstAuthority?.emirate ?? null,
      legalStructure:
        jurisdiction === 'mainland' ? 'llc' : jurisdiction === 'offshore' ? 'offshore_company' : 'fz_llc',
      officeType: jurisdiction === 'offshore' ? 'none' : 'flexi',
    });
  }

  function setAuthority(authorityName: string) {
    const authority = authorities.find(
      (candidate) =>
        candidate.jurisdiction === input.jurisdiction && candidate.authority === authorityName,
    );
    patch({ authority: authorityName, emirate: authority?.emirate ?? null });
  }

  function toggleAddOn(addOn: AddOn) {
    const next = new Set(input.addOns ?? []);
    if (next.has(addOn)) next.delete(addOn);
    else next.add(addOn);
    patch({ addOns: [...next] });
  }

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/public/estimate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not calculate estimate');
      setQuote(body as EstimateResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not calculate estimate');
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    setDownloading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/public/estimate/pdf', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? 'Could not generate PDF');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `mandoob-estimate-${quote?.estimate.reference ?? 'quote'}.pdf`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate PDF');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)] lg:px-8">
      <form onSubmit={calculate} className="rounded-lg border bg-background p-4 shadow-sm sm:p-5">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase">
              Public estimator
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">UAE company setup quote</h1>
          </div>
          <div className="bg-primary/10 text-primary rounded-md p-2">
            <Calculator className="size-5" aria-hidden />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Jurisdiction">
            <Select value={input.jurisdiction} onValueChange={(value) => setJurisdiction(value as Jurisdiction)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(JURISDICTION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Authority">
            <Select value={input.authority} onValueChange={setAuthority}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {authorityOptions.map((authority) => (
                  <SelectItem key={authority.authority} value={authority.authority}>
                    {authority.authority}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Business activity">
            <Select value={input.activityKey} onValueChange={(activityKey) => patch({ activityKey })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_OPTIONS.map((activity) => (
                  <SelectItem key={activity.value} value={activity.value}>
                    {activity.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Legal structure">
            <Select
              value={input.legalStructure}
              onValueChange={(legalStructure) => patch({ legalStructure: legalStructure as LegalStructure })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {legalStructureOptions.map((structure) => (
                  <SelectItem key={structure.value} value={structure.value}>
                    {structure.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Shareholders">
            <Input
              min={1}
              max={50}
              type="number"
              value={input.shareholderCount}
              onChange={(event) => patch({ shareholderCount: Number(event.target.value) })}
            />
          </Field>

          <Field label="Visas">
            <Input
              min={0}
              max={200}
              type="number"
              value={input.visaCount}
              onChange={(event) => patch({ visaCount: Number(event.target.value) })}
            />
          </Field>

          <Field label="Office type">
            <Select value={input.officeType} onValueChange={(officeType) => patch({ officeType: officeType as OfficeType })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {officeTypeOptions.map((office) => (
                  <SelectItem key={office.value} value={office.value}>
                    {office.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="mt-5 rounded-md border bg-muted/30 p-3">
          <Label className="text-sm font-medium">Add-ons</Label>
          <div className="mt-3 grid gap-3">
            {ADD_ONS.map((addOn) => (
              <label key={addOn.value} className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={(input.addOns ?? []).includes(addOn.value)}
                  onCheckedChange={() => toggleAddOn(addOn.value)}
                />
                {addOn.label}
              </label>
            ))}
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="mt-5 w-full" disabled={loading}>
          {loading ? 'Calculating...' : 'Calculate quote'}
        </Button>
      </form>

      <aside className="rounded-lg border bg-background p-4 shadow-sm sm:p-5">
        {quote ? (
          <QuoteResult
            quote={quote}
            downloading={downloading}
            onDownloadPdf={downloadPdf}
          />
        ) : (
          <div className="flex min-h-[520px] flex-col justify-between">
            <div>
              <div className="bg-amber-500/10 text-amber-700 dark:text-amber-300 mb-5 inline-flex rounded-md p-2">
                <FileText className="size-5" aria-hidden />
              </div>
              <h2 className="text-xl font-semibold">Transparent estimate before the first call</h2>
              <p className="text-muted-foreground mt-3 text-sm leading-6">
                The quote uses estimate-grade authority rows for Mainland, Offshore, and 45+ Free Zones.
                No lead is created until the application questionnaire is submitted.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <Metric value="AED" label="Currency" />
              <Metric value="45+" label="Free Zones" />
              <Metric value="PDF" label="Export" />
            </div>
          </div>
        )}
      </aside>
    </section>
  );
}

function legalStructureAllowed(jurisdiction: Jurisdiction, legalStructure: LegalStructure): boolean {
  if (jurisdiction === 'mainland') return legalStructure === 'llc' || legalStructure === 'branch';
  if (jurisdiction === 'free_zone') return legalStructure === 'fz_llc' || legalStructure === 'branch';
  return legalStructure === 'offshore_company';
}

function QuoteResult({
  quote,
  downloading,
  onDownloadPdf,
}: {
  quote: EstimateResponse;
  downloading: boolean;
  onDownloadPdf: () => void;
}) {
  const { estimate } = quote;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs font-medium uppercase">Estimate {estimate.reference}</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{estimate.oneTimeTotal}</h2>
          <p className="text-muted-foreground mt-1 text-sm">One-time setup estimate</p>
        </div>
        <div className="rounded-md border px-3 py-2 text-right">
          <div className="text-sm font-medium">{estimate.annualTotal}</div>
          <div className="text-muted-foreground text-xs">Annual recurring</div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Metric value={`${estimate.timelineDays.min}-${estimate.timelineDays.max}`} label="Business days" />
        <Metric value={estimate.lineItems.length.toString()} label="Fee lines" />
      </div>

      <div className="mt-5 overflow-hidden rounded-md border">
        <div className="bg-muted/40 grid grid-cols-[1fr_72px_112px] gap-3 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>Fee</span>
          <span>Qty</span>
          <span className="text-right">Total</span>
        </div>
        <div className="divide-y">
          {estimate.lineItems.map((item) => (
            <div key={item.id} className="grid grid-cols-[1fr_72px_112px] gap-3 px-3 py-3 text-sm">
              <div>
                <div className="font-medium">{item.label}</div>
                <div className="text-muted-foreground text-xs">{item.recurrence.replace('_', ' ')}</div>
              </div>
              <div className="text-muted-foreground">{item.quantity}</div>
              <div className="text-right font-medium">
                {new Intl.NumberFormat('en-AE', {
                  style: 'currency',
                  currency: estimate.currency,
                }).format(item.totalMinor / 100)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-medium">Required documents</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {estimate.requiredDocumentKeys.map((key) => (
            <span key={key} className="rounded-md border bg-muted/30 px-2 py-1 text-xs">
              {DOCUMENT_LABELS[key] ?? key}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-md bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
        <div className="font-medium text-foreground">Estimate-grade pricing</div>
        <div className="mt-1">
          Generated {new Date(estimate.generatedAt).toLocaleString('en-GB')} from active cost rows.
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {estimate.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button type="button" variant="outline" className="flex-1" onClick={onDownloadPdf} disabled={downloading}>
          <Download aria-hidden />
          {downloading ? 'Preparing...' : 'Download PDF'}
        </Button>
        <Button asChild className="flex-1">
          <a href={quote.handoffUrl}>
            Apply now
            <ArrowRight aria-hidden />
          </a>
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}
