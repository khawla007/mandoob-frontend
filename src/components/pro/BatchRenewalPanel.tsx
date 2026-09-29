'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { batchTransitionRenewalsAction } from '@/app/(tenant)/t/[tenant]/(pro)/renewals/actions';
import type { RenewalWorkspaceRow } from '@/lib/data/pro-renewal-workspace';

/** PRD §15.2 bulk initiation: all selected renewals move together or none do. */
export function BatchRenewalPanel({ slug, rows }: { slug: string; rows: RenewalWorkspaceRow[] }) {
  const router = useRouter();
  const t = useTranslations('p308.renewals');
  const errors = useTranslations('p308.errors');
  const eligible = rows.filter((row) => row.stage === 'due' && !row.blockerCode);
  const [selected, setSelected] = useState<string[]>([]);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  if (eligible.length === 0) return null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const items = eligible
      .filter((row) => selected.includes(row.id))
      .map((row) => ({ renewal_id: row.id, expected_version: row.version }));
    if (items.length === 0) return;
    startTransition(async () => {
      const result = await batchTransitionRenewalsAction(slug, {
        operation_id: operationId,
        to_stage: 'in_progress',
        items,
      });
      if (!result.ok) {
        setMessage({
          ok: false,
          text: errors.has(result.code) ? errors(result.code) : errors('INTERNAL'),
        });
        return;
      }
      setMessage({ ok: true, text: t('batchDone', { count: result.data.count }) });
      setSelected([]);
      setOperationId(crypto.randomUUID());
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border p-4"
      aria-label={t('batchTitle')}
    >
      <div>
        <h2 className="text-base font-semibold">{t('batchTitle')}</h2>
        <p className="text-muted-foreground text-sm">{t('batchDescription')}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {eligible.map((row) => (
          <label key={row.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={selected.includes(row.id)}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, row.id]
                    : current.filter((id) => id !== row.id),
                )
              }
            />
            <span className="break-words">{row.label}</span>
          </label>
        ))}
      </div>
      {message ? (
        <Alert variant={message.ok ? 'default' : 'destructive'} role="status">
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending || selected.length === 0}>
        {pending ? t('saving') : t('batchStart', { count: selected.length })}
      </Button>
    </form>
  );
}
