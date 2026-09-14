'use client';

import { useState, useTransition } from 'react';
import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

type OpenDocumentAction = () => Promise<
  | { ok: true; data: { url: string; expiresAt: string } }
  | { ok: false; code: 'DOCUMENT_UNAVAILABLE' | 'OPEN_FAILED' }
>;

export function OpenEmployeeSignedUrlButton({ action }: { action: OpenDocumentAction }) {
  const t = useTranslations('employee.common');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onOpen() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(t('downloadFailed'));
        return;
      }
      window.location.assign(result.data.url);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" variant="outline" onClick={onOpen} disabled={pending}>
        <ExternalLink aria-hidden="true" className="size-4" />
        {pending ? t('opening') : t('download')}
      </Button>
      {error && (
        <p role="alert" className="text-destructive max-w-48 text-right text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
