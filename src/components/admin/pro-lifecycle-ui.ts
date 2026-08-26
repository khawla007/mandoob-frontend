import { formatDateTime } from '@/lib/i18n/format';
import { decodeProTimelineCursor } from '@/lib/validation/pro-lifecycle';

export type ProTimelineSearch = { cursor: string | null; invalid: boolean };

export function parseProTimelineSearchParams(value: unknown): ProTimelineSearch {
  if (value === undefined) return { cursor: null, invalid: false };
  if (typeof value !== 'string') return { cursor: null, invalid: true };
  try {
    decodeProTimelineCursor(value);
    return { cursor: value, invalid: false };
  } catch {
    return { cursor: null, invalid: true };
  }
}

export function buildProTimelineHref(userId: string, cursor: string | null): string {
  const base = `/admin/users/${encodeURIComponent(userId)}`;
  return cursor ? `${base}?timeline=${encodeURIComponent(cursor)}` : base;
}

export function formatProLifecycleTimestamp(value: string, locale: string): string {
  return formatDateTime(value, locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dubai',
  });
}

export function formatProCommercialDate(value: string, locale: string): string {
  return formatDateTime(`${value}T12:00:00.000Z`, locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Dubai',
  });
}
