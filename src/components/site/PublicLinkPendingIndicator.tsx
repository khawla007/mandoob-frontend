'use client';

import { useLinkStatus } from 'next/link';

export function PublicLinkPendingIndicator() {
  const { pending } = useLinkStatus();

  return (
    <span className="public-link-pending" role="status" aria-live="polite">
      {pending ? <span className="public-link-pending__spinner" aria-hidden="true" /> : null}
      <span className="sr-only">{pending ? 'Loading page' : ''}</span>
    </span>
  );
}
