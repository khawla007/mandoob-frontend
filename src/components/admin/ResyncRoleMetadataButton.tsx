'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { postJson } from '@/lib/http/post';

export function ResyncRoleMetadataButton({ userId }: { userId: string }) {
  const t = useTranslations('admin');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function resync() {
    setSubmitting(true);
    setMessage(null);
    const response = await postJson(`/api/v1/admin/users/${userId}/role/resync`, {});
    setSubmitting(false);
    if (response.ok) {
      setMessage(t('user.roleChange.resyncSuccess'));
      return;
    }
    let payload: { error?: string } = {};
    try {
      payload = await response.json();
    } catch {
      // Use the localized fallback below.
    }
    setMessage(payload.error ?? t('user.requestFailed', { status: response.status }));
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" onClick={resync} disabled={submitting}>
        {submitting ? t('user.roleChange.resyncing') : t('user.roleChange.resync')}
      </Button>
      {message ? <p className="text-muted-foreground max-w-56 text-xs">{message}</p> : null}
    </div>
  );
}
