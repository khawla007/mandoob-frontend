'use client';

import { useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  BANK_EVIDENCE_ACCEPT,
  MAX_BANK_EVIDENCE_BYTES,
} from '@/lib/finance/bank-evidence-contract';

function csrfToken() {
  const entry = document.cookie.split('; ').find((cookie) => cookie.startsWith('mandoob-csrf='));
  try {
    return entry ? decodeURIComponent(entry.split('=')[1] ?? '') : null;
  } catch {
    return null;
  }
}

export function BankEvidenceUpload({ slug, invoiceId }: { slug: string; invoiceId: string }) {
  const t = useTranslations('bankEvidence');
  const router = useRouter();
  const operationId = useRef<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    if (!(file instanceof File) || file.size < 1 || file.size > MAX_BANK_EVIDENCE_BYTES) {
      setMessage(t('invalidFile'));
      return;
    }
    operationId.current ??= crypto.randomUUID();
    data.set('operation_id', operationId.current);
    startTransition(async () => {
      try {
        const headers = new Headers();
        const csrf = csrfToken();
        if (csrf) headers.set('x-mandoob-csrf', csrf);
        const response = await fetch(
          `/api/v1/t/${encodeURIComponent(slug)}/customer/payments/bank-evidence`,
          {
            method: 'POST',
            credentials: 'same-origin',
            headers,
            body: data,
          },
        );
        if (!response.ok) {
          setMessage(t('failed'));
          return;
        }
        operationId.current = null;
        form.reset();
        setMessage(t('submitted'));
        router.refresh();
      } catch {
        setMessage(t('failed'));
      }
    });
  }
  return (
    <form onSubmit={submit} className="signal-panel space-y-3 rounded-lg border p-4">
      <div>
        <h2 className="font-medium">{t('uploadTitle')}</h2>
        <p className="text-muted-foreground text-sm">{t('uploadDescription')}</p>
      </div>
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <Label htmlFor="bank-evidence-file">{t('file')}</Label>
      <Input
        id="bank-evidence-file"
        name="file"
        type="file"
        accept={BANK_EVIDENCE_ACCEPT}
        required
        disabled={pending}
        onChange={() => {
          operationId.current = null;
          setMessage(null);
        }}
      />
      <Button type="submit" className="min-h-11 w-full" disabled={pending}>
        {pending ? t('uploading') : t('upload')}
      </Button>
      {message ? (
        <p role="status" className="text-muted-foreground text-sm">
          {message}
        </p>
      ) : null}
    </form>
  );
}
