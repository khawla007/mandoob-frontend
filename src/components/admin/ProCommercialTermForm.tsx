'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { postJson } from '@/lib/http/post';
import type { ProLifecycleDetail } from '@/lib/data/pro-lifecycle-detail';
import {
  claimFormSubmission,
  releaseFormSubmission,
} from '@/components/admin/form-submission-guard';

type Term = ProLifecycleDetail['commercialTerms'][number];

function amountToMinor(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/u.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function ProCommercialTermForm({
  userId,
  termKind,
  term,
}: {
  userId: string;
  termKind: 'pricing' | 'compensation';
  term: Term | null;
}) {
  const t = useTranslations('admin.user.proLifecycle.terms.form');
  const router = useRouter();
  const [model, setModel] = useState<'per_registration' | 'retainer'>('per_registration');
  const [amount, setAmount] = useState('');
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const latch = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const mode = term?.status === 'draft' ? 'activate' : term?.status === 'active' ? 'end' : 'create';

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!claimFormSubmission(latch)) return;
    setError(null);
    setSaved(null);
    let body: Record<string, unknown>;
    if (mode === 'activate' && term) {
      body = {
        command: 'activate',
        termId: term.termId,
        expectedVersion: term.version,
        operationId: crypto.randomUUID(),
      };
    } else if (mode === 'end' && term) {
      if (!effectiveTo) {
        setError(t('endRequired'));
        releaseFormSubmission(latch);
        queueMicrotask(() => errorRef.current?.focus());
        return;
      }
      body = {
        command: 'end',
        termId: term.termId,
        expectedVersion: term.version,
        effectiveTo,
        operationId: crypto.randomUUID(),
      };
    } else {
      const amountMinor = amountToMinor(amount);
      if (amountMinor === null || !effectiveFrom) {
        setError(t('required'));
        releaseFormSubmission(latch);
        queueMicrotask(() => errorRef.current?.focus());
        return;
      }
      body = {
        command: 'create_draft',
        termKind,
        model,
        currency: 'AED',
        amountMinor,
        retainerInterval: model === 'retainer' ? interval : null,
        effectiveFrom,
        effectiveTo: effectiveTo || null,
        operationId: crypto.randomUUID(),
      };
    }
    setPending(true);
    try {
      const response = await postJson(`/api/v1/admin/users/${userId}/commercial-terms`, body);
      if (!response.ok) {
        let code = '';
        try {
          code = String(((await response.json()) as { code?: string }).code ?? '');
        } catch {
          // Keep the fallback localized and sanitized.
        }
        setError(
          code.startsWith('STALE_')
            ? t('stale')
            : code === 'TERM_IN_PROGRESS' || code === 'OPERATION_REUSED'
              ? t('conflict')
              : t('failed'),
        );
        queueMicrotask(() => errorRef.current?.focus());
        return;
      }
      setSaved(t('saved'));
      router.refresh();
    } catch {
      setError(t('failed'));
      queueMicrotask(() => errorRef.current?.focus());
    } finally {
      setPending(false);
      releaseFormSubmission(latch);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      {error ? (
        <Alert ref={errorRef} tabIndex={-1} variant="destructive">
          <AlertTitle>{t('errorTitle')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={pending} className="space-y-4">
        <legend className="text-sm font-medium">{t(`legends.${mode}`)}</legend>
        {mode === 'create' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${termKind}-model`}>{t('model')}</Label>
              <select
                id={`${termKind}-model`}
                value={model}
                onChange={(event) => setModel(event.target.value as typeof model)}
                className="border-input bg-background min-h-11 w-full rounded-lg border px-3 text-sm"
              >
                <option value="per_registration">{t('models.per_registration')}</option>
                <option value="retainer">{t('models.retainer')}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${termKind}-amount`}>{t('amount')}</Label>
              <Input
                id={`${termKind}-amount`}
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={t('amountPlaceholder')}
                required
                dir="ltr"
                className="min-h-11"
              />
              <p className="text-muted-foreground text-xs">{t('amountHelp')}</p>
            </div>
            {model === 'retainer' ? (
              <div className="space-y-2">
                <Label htmlFor={`${termKind}-interval`}>{t('interval')}</Label>
                <select
                  id={`${termKind}-interval`}
                  value={interval}
                  onChange={(event) => setInterval(event.target.value as typeof interval)}
                  className="border-input bg-background min-h-11 w-full rounded-lg border px-3 text-sm"
                >
                  <option value="monthly">{t('intervals.monthly')}</option>
                  <option value="annual">{t('intervals.annual')}</option>
                </select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor={`${termKind}-from`}>{t('effectiveFrom')}</Label>
              <Input
                id={`${termKind}-from`}
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                required
                dir="ltr"
                className="min-h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${termKind}-optional-to`}>{t('effectiveTo')}</Label>
              <Input
                id={`${termKind}-optional-to`}
                type="date"
                value={effectiveTo}
                min={effectiveFrom || undefined}
                onChange={(event) => setEffectiveTo(event.target.value)}
                dir="ltr"
                className="min-h-11"
              />
            </div>
          </div>
        ) : null}
        {mode === 'end' ? (
          <div className="space-y-2">
            <Label htmlFor={`${termKind}-to`}>{t('effectiveTo')}</Label>
            <Input
              id={`${termKind}-to`}
              type="date"
              value={effectiveTo}
              onChange={(event) => setEffectiveTo(event.target.value)}
              required
              dir="ltr"
              className="min-h-11"
            />
          </div>
        ) : null}
        <Button
          type="submit"
          variant={mode === 'end' ? 'outline' : 'default'}
          disabled={pending}
          className="min-h-11"
        >
          {pending ? t('pending') : t(`actions.${mode}`)}
        </Button>
      </fieldset>
      <p aria-live="polite" className="text-muted-foreground text-sm">
        {saved}
      </p>
    </form>
  );
}
