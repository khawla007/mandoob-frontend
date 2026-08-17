export function localizeOperationalValue(
  labels: Readonly<Record<string, string>>,
  value: string,
  fallback: string,
): string {
  return labels[value] ?? fallback;
}

export function formatCompanyMoney(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountMinor / 100);
}
