const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function formatSignalDate(
  value: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

export function formatSignalDeadline(value: string | null, locale: string): string | null {
  if (!value) return null;
  if (DATE_ONLY.test(value)) {
    return formatSignalDate(value, locale, { dateStyle: 'medium' });
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dubai',
  }).format(new Date(value));
}

export function signalLabel(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
