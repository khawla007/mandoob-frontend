/**
 * Back-compat shim. Existing call sites import `formatAdminDateTime` with no
 * locale and expect en-GB output. New code should call
 * `formatDateTime`/`formatDateShort` from `@/lib/i18n/format` with an explicit
 * locale.
 */

import { formatDateTime } from '@/lib/i18n/format';

export function formatAdminDateTime(iso: string | null): string {
  // Preserve historical en-GB shape used by admin tables (already locale-aware
  // via Intl). The new locale-aware formatter is exported from lib/i18n/format.
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export { formatDateTime };
