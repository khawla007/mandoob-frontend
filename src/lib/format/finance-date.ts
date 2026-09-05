const DUBAI_TIME_ZONE = 'Asia/Dubai';

export function formatFinanceDate(
  value: string | null | undefined,
  locale: string,
  unavailable: string,
): string {
  if (!value) return unavailable;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return unavailable;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: DUBAI_TIME_ZONE }).format(
    date,
  );
}
