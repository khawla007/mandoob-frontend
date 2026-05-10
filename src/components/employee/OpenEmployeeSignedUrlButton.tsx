'use client';

import { useState, useTransition } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getEmployeeDocumentSignedUrlAction } from '@/app/(tenant)/t/[tenant]/(employee)/employee/documents/actions';

export function OpenEmployeeSignedUrlButton({
  slug,
  versionId,
}: {
  slug: string;
  versionId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onOpen() {
    setError(null);
    startTransition(async () => {
      const result = await getEmployeeDocumentSignedUrlAction(slug, versionId);
      if (!result.ok) {
        setError(`${result.code}: ${result.error}`);
        return;
      }
      window.open(result.data.url, '_blank', 'noopener,noreferrer');
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" variant="outline" onClick={onOpen} disabled={pending}>
        <ExternalLink className="size-4" />
        {pending ? 'Opening' : 'Open'}
      </Button>
      {error && <p className="text-destructive max-w-48 text-right text-xs">{error}</p>}
    </div>
  );
}
