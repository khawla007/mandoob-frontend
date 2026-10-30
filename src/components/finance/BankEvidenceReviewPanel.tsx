'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { BankEvidenceReviewRow } from '@/lib/finance/bank-evidence-review';

type ReviewInput = {
  tenantSlug?: string;
  tenantId: string;
  companyId: string;
  submissionId: string;
  operationId: string;
  expectedVersion: number;
  expectedState: 'pending';
  decision: 'clean' | 'rejected';
  note: string | null;
};
type OpenInput = Pick<ReviewInput, 'tenantSlug' | 'tenantId' | 'companyId' | 'submissionId'> & {
  lifetimeSeconds: number;
};
type SafeResult<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

export function BankEvidenceReviewPanel({
  rows,
  labels,
  reviewAction,
  openAction,
  tenantSlug,
}: {
  rows: BankEvidenceReviewRow[];
  labels: {
    title: string;
    description: string;
    empty: string;
    open: string;
    clean: string;
    reject: string;
    rejectTitle: string;
    rejectDescription: string;
    rejectReason: string;
    confirmReject: string;
    cancel: string;
    actionFailed: string;
    states: Record<string, string>;
  };
  reviewAction: (input: ReviewInput) => Promise<SafeResult<{ state: string; version: number }>>;
  openAction: (input: OpenInput) => Promise<SafeResult<{ url: string; expiresAt: string }>>;
  tenantSlug?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<BankEvidenceReviewRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const operations = useRef(new Map<string, string>());

  function open(row: BankEvidenceReviewRow) {
    const popup = window.open('about:blank', 'bank-evidence');
    if (popup) popup.opener = null;
    startTransition(async () => {
      setFailure(null);
      try {
        const result = await openAction({
          tenantSlug,
          tenantId: row.tenantId,
          companyId: row.companyId,
          submissionId: row.id,
          lifetimeSeconds: 60,
        });
        if (!result.ok) {
          popup?.close();
          return setFailure(labels.actionFailed);
        }
        if (popup) popup.location.replace(result.data.url);
        else window.location.assign(result.data.url);
      } catch {
        popup?.close();
        setFailure(labels.actionFailed);
      }
    });
  }

  function review(
    row: BankEvidenceReviewRow,
    decision: 'clean' | 'rejected',
    note: string | null = null,
  ) {
    startTransition(async () => {
      setFailure(null);
      const key = `${row.id}:${decision}`;
      const operationId = operations.current.get(key) ?? crypto.randomUUID();
      operations.current.set(key, operationId);
      const result = await reviewAction({
        tenantSlug,
        tenantId: row.tenantId,
        companyId: row.companyId,
        submissionId: row.id,
        operationId,
        expectedVersion: row.version,
        expectedState: 'pending',
        decision,
        note: decision === 'rejected' ? note?.trim() || null : null,
      });
      if (!result.ok) return setFailure(labels.actionFailed);
      operations.current.delete(key);
      setRejecting(null);
      setRejectReason('');
      router.refresh();
    });
  }

  return (
    <Card className="signal-panel">
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {failure ? (
          <p role="alert" className="text-destructive mb-3 text-sm">
            {failure}
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{labels.empty}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs break-all">{row.invoiceId}</p>
                  <Badge
                    variant={
                      ['rejected', 'expired', 'tombstoned'].includes(row.state)
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {labels.states[row.state] ?? row.state}
                  </Badge>
                </div>
                {row.state === 'pending' || row.state === 'clean' ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => open(row)}
                    >
                      {labels.open}
                    </Button>
                    {row.state === 'pending' ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => review(row, 'clean')}
                        >
                          {labels.clean}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={pending}
                          onClick={() => setRejecting(row)}
                        >
                          {labels.reject}
                        </Button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <Dialog
        open={rejecting !== null}
        onOpenChange={(open) => {
          if (!open) {
            if (rejecting) operations.current.delete(`${rejecting.id}:rejected`);
            setRejecting(null);
            setRejectReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.rejectTitle}</DialogTitle>
            <DialogDescription>{labels.rejectDescription}</DialogDescription>
          </DialogHeader>
          <Input
            aria-label={labels.rejectReason}
            placeholder={labels.rejectReason}
            value={rejectReason}
            maxLength={280}
            onChange={(event) => {
              if (rejecting) operations.current.delete(`${rejecting.id}:rejected`);
              setRejectReason(event.target.value);
            }}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {labels.cancel}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || rejectReason.trim().length < 3}
              onClick={() => rejecting && review(rejecting, 'rejected', rejectReason)}
            >
              {labels.confirmReject}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
