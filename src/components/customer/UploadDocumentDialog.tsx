'use client';

import { useState, useTransition } from 'react';
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
import { uploadDocumentAction } from '@/app/(tenant)/t/[tenant]/(customer)/portal/documents/actions';
import { uploadErrorMessage } from '@/lib/documents/upload-errors';
import type { DocType } from '@/lib/validation/document';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

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
}) {
  const { slug, docType, requestId, label } = props;
  const router = useRouter();
  const t = useTranslations('customer');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
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
    startTransition(async () => {
      const result = await uploadDocumentAction(slug, formData);
      if (!result.ok) {
        setError(uploadErrorMessage(result.code, result.error));
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {t('uploadButton')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {t('uploadButton')} — {label}
            </DialogTitle>
            <DialogDescription>{t('longCopy.uploadDialogDescription')}</DialogDescription>
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
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t('uploading') : t('uploadButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
