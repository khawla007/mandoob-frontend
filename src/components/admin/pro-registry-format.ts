import { formatDateTime } from '@/lib/i18n/format';

export function formatProRegistryDate(value: string, locale: string): string {
  return formatDateTime(value, locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Dubai',
  });
}
