'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
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

const JURISDICTION_VALUES: Jurisdiction[] = ['mainland', 'free_zone', 'offshore'];

const LEGAL_STRUCTURES: { value: LegalStructure }[] = [
  { value: 'fz_llc' },
  { value: 'llc' },
  { value: 'branch' },
  { value: 'offshore_company' },
];

const OFFICE_TYPES: { value: OfficeType }[] = [{ value: 'flexi' }, { value: 'none' }];

const ADD_ONS: { value: AddOn }[] = [
  { value: 'bank_account' },
  { value: 'tax_registration' },
  { value: 'document_attestation' },
];

const ACTIVITY_OPTIONS = [{ value: 'consulting' }];

export function CostEstimator({ authorities }: { authorities: AuthorityOption[] }) {
  const t = useTranslations('estimator');
  const [input, setInput] = useState<EstimateInput>(() => ({
    jurisdiction: 'free_zone',
    authority:
      authorities.find((a) => a.jurisdiction === 'free_zone')?.authority ??
      authorities[0]?.authority ??
      '',
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
    () =>
      LEGAL_STRUCTURES.filter((structure) =>
        legalStructureAllowed(input.jurisdiction, structure.value),
      ),
    [input.jurisdiction],
  );
  const officeTypeOptions = useMemo(
    () =>
      OFFICE_TYPES.filter((office) => input.jurisdiction !== 'offshore' || office.value === 'none'),
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
        jurisdiction === 'mainland'
          ? 'llc'
          : jurisdiction === 'offshore'
            ? 'offshore_company'
            : 'fz_llc',
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
      if (!response.ok) throw new Error(body.error ?? t('errors.calculateFailed'));
      setQuote(body as EstimateResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.calculateFailed'));
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
        throw new Error(body?.error ?? t('errors.pdfFailed'));
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
      setError(err instanceof Error ? err.message : t('errors.pdfFailed'));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="est-cols">
      <form onSubmit={calculate} className="est-cols__form">
        <div className="est-form__head">
          <span className="eyebrow">{t('formEyebrow')}</span>
          <h1>{t('formTitle')}</h1>
        </div>

        <div className="est-grid">
          <Field id="estimate-jurisdiction" label={t('fields.jurisdiction')}>
            <Select
              value={input.jurisdiction}
              onValueChange={(value) => setJurisdiction(value as Jurisdiction)}
            >
              <SelectTrigger id="estimate-jurisdiction" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JURISDICTION_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`jurisdiction.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="estimate-authority" label={t('fields.authority')}>
            <Select value={input.authority} onValueChange={setAuthority}>
              <SelectTrigger id="estimate-authority" className="w-full">
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

          <Field id="estimate-activity" label={t('fields.activity')}>
            <Select
              value={input.activityKey}
              onValueChange={(activityKey) => patch({ activityKey })}
            >
              <SelectTrigger id="estimate-activity" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_OPTIONS.map((activity) => (
                  <SelectItem key={activity.value} value={activity.value}>
                    {t(`activity.${activity.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="estimate-legal-structure" label={t('fields.legalStructure')}>
            <Select
              value={input.legalStructure}
              onValueChange={(legalStructure) =>
                patch({ legalStructure: legalStructure as LegalStructure })
              }
            >
              <SelectTrigger id="estimate-legal-structure" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {legalStructureOptions.map((structure) => (
                  <SelectItem key={structure.value} value={structure.value}>
                    {t(`legalStructure.${structure.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="estimate-shareholders" label={t('fields.shareholders')}>
            <Input
              id="estimate-shareholders"
              min={1}
              max={50}
              type="number"
              value={input.shareholderCount}
              onChange={(event) => patch({ shareholderCount: Number(event.target.value) })}
            />
          </Field>

          <Field id="estimate-visas" label={t('fields.visas')}>
            <Input
              id="estimate-visas"
              min={0}
              max={200}
              type="number"
              value={input.visaCount}
              onChange={(event) => patch({ visaCount: Number(event.target.value) })}
            />
          </Field>

          <Field id="estimate-office-type" label={t('fields.officeType')}>
            <Select
              value={input.officeType}
              onValueChange={(officeType) => patch({ officeType: officeType as OfficeType })}
            >
              <SelectTrigger id="estimate-office-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {officeTypeOptions.map((office) => (
                  <SelectItem key={office.value} value={office.value}>
                    {t(`officeType.${office.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="est-addons">
          <span className="est-addons__title">{t('addOnsTitle')}</span>
          <div className="est-addons__list">
            {ADD_ONS.map((addOn) => (
              <label key={addOn.value} className="est-addon">
                <Checkbox
                  checked={(input.addOns ?? []).includes(addOn.value)}
                  onCheckedChange={() => toggleAddOn(addOn.value)}
                />
                {t(`addOns.${addOn.value}`)}
              </label>
            ))}
          </div>
        </div>

        {error ? <p className="est-error">{error}</p> : null}

        <button type="submit" className="btn btn--accent btn--lg est-btn-block" disabled={loading}>
          {loading ? t('calculating') : t('calculate')}
        </button>
      </form>

      <section aria-labelledby="estimate-result-heading" className="est-cols__result">
        {quote ? (
          <QuoteResult quote={quote} downloading={downloading} onDownloadPdf={downloadPdf} />
        ) : (
          <div className="est-placeholder">
            <div>
              <span className="eyebrow">{t('preview.eyebrow')}</span>
              <h2 id="estimate-result-heading" className="mt-3">
                {t('preview.title')}
              </h2>
              <p>{t('preview.body')}</p>
            </div>
            <div className="est-metrics">
              <Metric value="AED" label={t('metrics.currency')} />
              <Metric value="45+" label={t('metrics.freeZones')} />
              <Metric value="PDF" label={t('metrics.export')} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function legalStructureAllowed(
  jurisdiction: Jurisdiction,
  legalStructure: LegalStructure,
): boolean {
  if (jurisdiction === 'mainland') return legalStructure === 'llc' || legalStructure === 'branch';
  if (jurisdiction === 'free_zone')
    return legalStructure === 'fz_llc' || legalStructure === 'branch';
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
  const t = useTranslations('estimator');
  const { estimate } = quote;

  return (
    <div>
      <div className="est-result__head">
        <div>
          <span className="eyebrow">
            {t('result.estimateRef', { reference: estimate.reference })}
          </span>
          <h2 id="estimate-result-heading" className="est-result__total">
            {estimate.oneTimeTotal}
          </h2>
          <p className="est-result__sub">{t('result.oneTimeLabel')}</p>
        </div>
        <div className="est-result__annual">
          <div className="est-result__annualV mono">{estimate.annualTotal}</div>
          <div className="est-result__annualL">{t('result.annualLabel')}</div>
        </div>
      </div>

      <div className="est-metrics est-metrics--2" style={{ marginTop: 'var(--sp-4)' }}>
        <Metric
          value={`${estimate.timelineDays.min}-${estimate.timelineDays.max}`}
          label={t('result.businessDays')}
        />
        <Metric value={estimate.lineItems.length.toString()} label={t('result.feeLines')} />
      </div>

      <div className="est-table">
        <div className="est-table__head">
          <span>{t('table.fee')}</span>
          <span>{t('table.qty')}</span>
          <span style={{ textAlign: 'end' }}>{t('table.total')}</span>
        </div>
        {estimate.lineItems.map((item) => (
          <div key={item.id} className="est-table__row">
            <div>
              <div className="est-table__label">{item.label}</div>
              <div className="est-table__rec mono">{item.recurrence.replace('_', ' ')}</div>
            </div>
            <div className="mono">{item.quantity}</div>
            <div className="est-table__num mono">
              {new Intl.NumberFormat('en-AE', {
                style: 'currency',
                currency: estimate.currency,
              }).format(item.totalMinor / 100)}
            </div>
          </div>
        ))}
      </div>

      <div className="est-docs">
        <h3>{t('result.requiredDocs')}</h3>
        <div className="est-docs__list">
          {estimate.requiredDocumentKeys.map((key) => (
            <span key={key} className="est-docchip">
              {t.has(`documents.${key}`) ? t(`documents.${key}`) : key}
            </span>
          ))}
        </div>
      </div>

      <div className="est-note">
        <div className="est-note__title">{t('result.noteTitle')}</div>
        <div style={{ marginTop: 4 }}>
          {t('result.generated', {
            date: new Date(estimate.generatedAt).toLocaleString('en-GB'),
          })}
        </div>
        <ul>
          {estimate.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </div>

      <div className="est-cta">
        <button
          type="button"
          className="btn btn--outline"
          onClick={onDownloadPdf}
          disabled={downloading}
        >
          {downloading ? t('result.preparing') : t('result.downloadPdf')}
        </button>
        <a className="btn btn--accent" href={quote.handoffUrl}>
          {t('result.applyNow')} <span aria-hidden="true">↗</span>
        </a>
      </div>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="est-label">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="est-metric">
      <div className="est-metric__v mono">{value}</div>
      <div className="est-metric__l">{label}</div>
    </div>
  );
}
