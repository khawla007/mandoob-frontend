const MAX_EXPORT_ROWS = 1000;
const DANGEROUS_PREFIX = /^[\t\r ]*[=+\-@]/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;

export function sanitizeSpreadsheetCell(value: unknown): string {
  const normalized = String(value ?? '').replace(CONTROL_CHARACTERS, '');
  return DANGEROUS_PREFIX.test(normalized) ? `'${normalized}` : normalized;
}

function quote(value: unknown): string {
  const safe = sanitizeSpreadsheetCell(value);
  return /[",\r\n]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function encodeCsv(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): string {
  if (rows.length > MAX_EXPORT_ROWS) throw new Error('Export row limit exceeded');
  const lines = [columns.map(quote).join(',')];
  for (const row of rows) lines.push(columns.map((column) => quote(row[column])).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
