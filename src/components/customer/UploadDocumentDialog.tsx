'use client';

import { useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAX_DOCUMENT_UPLOAD_BYTES } from '@/lib/documents/upload-contract';
import type { DocType } from '@/lib/validation/document';

const MAX_FILE_BYTES = MAX_DOCUMENT_UPLOAD_BYTES;

const SAFE_UPLOAD_CODES = new Set([
  'VALIDATION_FAILED',
  'PAYLOAD_EMPTY',
  'UNSUPPORTED_MEDIA_TYPE',
  'PAYLOAD_TOO_LARGE',
  'FILE_REJECTED_BY_SCAN',
  'SCANNER_UNAVAILABLE',
  'DOCUMENT_UNAVAILABLE',
  'OPERATION_REUSED',
  'UPLOAD_FAILED',
]);

type UploadResult = { ok: true } | { ok: false; code: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isSuccessfulUploadPayload(payload: unknown): boolean {
  if (payload === null || typeof payload !== 'object') return false;
  const record = payload as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    record.ok !== true ||
    record.data === null ||
    typeof record.data !== 'object'
  ) {
    return false;
  }
  const data = record.data as Record<string, unknown>;
  return (
    Object.keys(data).length === 2 &&
    typeof data.documentId === 'string' &&
    UUID.test(data.documentId) &&
    typeof data.versionId === 'string' &&
    UUID.test(data.versionId)
  );
}

function csrfToken(): string | null {
  const entry = document.cookie.split('; ').find((cookie) => cookie.startsWith('mandoob-csrf='));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.split('=')[1] ?? '');
  } catch {
    return null;
  }
}

async function uploadThroughRoute(
  slug: string,
  audience: 'customer' | 'employee',
  formData: FormData,
): Promise<UploadResult> {
  try {
    const headers = new Headers();
    const csrf = csrfToken();
    if (csrf) headers.set('x-mandoob-csrf', csrf);
    const response = await fetch(
      `/api/v1/t/${encodeURIComponent(slug)}/${audience}/documents/upload`,
      {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: formData,
      },
    );
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, code: 'UPLOAD_FAILED' };
    }
    if (response.ok && isSuccessfulUploadPayload(payload)) {
      return { ok: true };
    }
    const code =
      payload !== null && typeof payload === 'object'
        ? (payload as { code?: unknown }).code
        : undefined;
    return {
      ok: false,
      code: typeof code === 'string' && SAFE_UPLOAD_CODES.has(code) ? code : 'UPLOAD_FAILED',
    };
  } catch {
    return { ok: false, code: 'UPLOAD_FAILED' };
  }
}

const ACCEPT = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

export function UploadDocumentDialog(props: {
  slug: string;
  docType: DocType;
  requestId?: string;
  label: string;
  audience?: 'customer' | 'employee';
}) {
  const { slug, docType, requestId, label, audience = 'customer' } = props;
  const router = useRouter();
  const t = useTranslations('customer');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const tDocument = useTranslations('customer.documentCenter');
  const tEmployee = useTranslations('employee.documents');
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const operationId = useRef<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError(null);
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setError(tErrors('pickFileFirst'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(tErrors('longCopy.uploadTooLarge'));
      return;
    }
    operationId.current ??= crypto.randomUUID();
    formData.set('operation_id', operationId.current);
    startTransition(async () => {
      const result = await uploadThroughRoute(slug, audience, formData);
      if (!result.ok) {
        setError(tDocument(`errors.${result.code}`));
        return;
      }
      operationId.current = null;
      form.reset();
      setOpen(false);
      router.refresh();
    });
  }

  const uploadLabel = audience === 'employee' ? tEmployee('uploadButton') : t('uploadButton');
  const uploadDescription =
    audience === 'employee'
      ? tEmployee('uploadDialogDescription')
      : t('longCopy.uploadDialogDescription');

  function handleOpenChange(next: boolean) {
    if (!next && pending) return;
    setOpen(next);
    if (!next) {
      setError(null);
      operationId.current = null;
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {uploadLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {uploadLabel} — {label}
            </DialogTitle>
            <DialogDescription>{uploadDescription}</DialogDescription>
          </DialogHeader>

          <input type="hidden" name="doc_type" value={docType} />
          {requestId && <input type="hidden" name="request_id" value={requestId} />}
          <input type="hidden" name="label" value={label} />

          <div className="grid gap-2">
            <Label htmlFor="upload-file">{tCommon('file')}</Label>
            <Input
              id="upload-file"
              name="file"
              type="file"
              accept={ACCEPT}
              required
              disabled={pending}
              onChange={() => {
                setError(null);
                operationId.current = null;
              }}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>{tErrors('uploadFailed')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? audience === 'employee'
                  ? tEmployee('uploading')
                  : t('uploading')
                : uploadLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
