'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { getCustomerDocumentSignedUrlAction } from '@/app/(tenant)/t/[tenant]/(customer)/portal/documents/actions';

export function OpenSignedUrlButton({ slug, versionId }: { slug: string; versionId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onOpen() {
    setError(null);
    startTransition(async () => {
      const result = await getCustomerDocumentSignedUrlAction(slug, versionId);
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
        {pending ? 'Opening…' : 'Open'}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
