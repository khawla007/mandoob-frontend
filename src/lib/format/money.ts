// Display formatter for amounts stored as minor units (e.g. fils for AED).
// Uses Intl.NumberFormat for locale-aware grouping/decimals; the storage
// always uses bigint to avoid float drift in the ledger.

const DECIMALS: Record<string, number> = {
  AED: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  SAR: 2,
};

export function formatMoney(
  amountMinor: bigint | number,
  currency: string,
  locale = 'en-AE',
): string {
  const decimals = DECIMALS[currency.toUpperCase()] ?? 2;
  const asNumber = typeof amountMinor === 'bigint' ? Number(amountMinor) : amountMinor;
  const major = asNumber / 10 ** decimals;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(major);
}
