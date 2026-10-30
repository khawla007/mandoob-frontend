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
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { transitionRenewalAction } from '@/app/(tenant)/t/[tenant]/(pro)/renewals/actions';
import type { RenewalWorkspaceRow } from '@/lib/data/pro-renewal-workspace';
import type { RenewalStage } from '@/lib/validation/renewal';
import { CANCEL_REASONS, EVIDENCE_STAGES, NEXT_RENEWAL_STAGES } from './renewal-stage-rules';

export type EvidenceOption = { id: string; label: string };

export function RenewalStageDialog({
  slug,
  row,
  evidenceOptions,
  open,
  onOpenChange,
}: {
  slug: string;
  row: RenewalWorkspaceRow;
  evidenceOptions: EvidenceOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open ? (
          <StageForm
            key={`${row.id}:${row.version}`}
            slug={slug}
            row={row}
            evidenceOptions={evidenceOptions}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function StageForm({
  slug,
  row,
  evidenceOptions,
  onClose,
}: {
  slug: string;
  row: RenewalWorkspaceRow;
  evidenceOptions: EvidenceOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const t = useTranslations('p308.renewals');
  const errors = useTranslations('p308.errors');
  const options = NEXT_RENEWAL_STAGES[row.stage];
  const [operationId] = useState(() => crypto.randomUUID());
  const [target, setTarget] = useState<RenewalStage>(options[0] ?? 'cancelled');
  const [evidence, setEvidence] = useState<string[]>([]);
  const [reason, setReason] = useState<string>(CANCEL_REASONS[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const needsEvidence = EVIDENCE_STAGES.includes(target);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await transitionRenewalAction(slug, row.id, {
        operation_id: operationId,
        expected_version: row.version,
        to_stage: target,
        ...(needsEvidence && evidence.length > 0 ? { evidence_document_ids: evidence } : {}),
        ...(target === 'cancelled' ? { reason_code: reason } : {}),
      });
      if (!result.ok) {
        setError(errors.has(result.code) ? errors(result.code) : errors('INTERNAL'));
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('stageTitle')}</DialogTitle>
        <DialogDescription>
          {t('stageDescription', { stage: t(`stages.${row.stage}`) })}
        </DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {row.blockerCode && target !== 'cancelled' ? (
          <p className="text-destructive text-sm">{t('blockedHint')}</p>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor={`stage-${row.id}`}>{t('targetStage')}</Label>
          <select
            id={`stage-${row.id}`}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            value={target}
            onChange={(event) => setTarget(event.target.value as RenewalStage)}
          >
            {options.map((stage) => (
              <option key={stage} value={stage}>
                {t(`stages.${stage}`)}
              </option>
            ))}
          </select>
        </div>
        {needsEvidence ? (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t('evidence')}</legend>
            {evidenceOptions.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('noEvidence')}</p>
            ) : (
              evidenceOptions.map((option) => (
                <label key={option.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={evidence.includes(option.id)}
                    onChange={(event) =>
                      setEvidence((current) =>
                        event.target.checked
                          ? [...current, option.id]
                          : current.filter((id) => id !== option.id),
                      )
                    }
                  />
                  {option.label}
                </label>
              ))
            )}
          </fieldset>
        ) : null}
        {target === 'cancelled' ? (
          <div className="grid gap-2">
            <Label htmlFor={`reason-${row.id}`}>{t('cancelReason')}</Label>
            <select
              id={`reason-${row.id}`}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            >
              {CANCEL_REASONS.map((code) => (
                <option key={code} value={code}>
                  {t(`cancelReasons.${code}`)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            {t('close')}
          </Button>
          <Button type="submit" disabled={pending || options.length === 0}>
            {pending ? t('saving') : t('applyStage')}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
